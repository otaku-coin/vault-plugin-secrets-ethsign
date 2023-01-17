// Copyright © 2023 Otaku Coin Association
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {strict as assert} from 'assert';
import {ethers, Wallet} from 'hardhat';
import {time} from '@nomicfoundation/hardhat-network-helpers';
import axios, {AxiosRequestConfig} from 'axios';
import sinon from 'sinon';
import {HashicorpVaultSigner} from '../src.ts/index';

const {arrayify, verifyMessage, hashMessage, splitSignature, parseTransaction} =
  ethers.utils;

const BASE_URL = 'http://127.0.0.1:8200';
const TOKEN = 'root';

async function registerWallet(wallet: Wallet) {
  const config: AxiosRequestConfig = {
    method: 'post',
    url: `${BASE_URL}/v1/ethereum/accounts`,
    responseType: 'json',
    data: {privateKey: wallet.privateKey},
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  };
  const resp = await axios(config);
}

describe('HashicorpVaultSigner', () => {
  const sandbox = sinon.createSandbox();
  let wallet: Wallet;
  let signer: HashicorpVaultSigner;
  let unknownSigner: HashicorpVaultSigner;

  before(async () => {
    const accounts = config.networks.hardhat.accounts;
    wallet = ethers.Wallet.fromMnemonic(
      accounts.mnemonic,
      `${accounts.path}/1`,
    );
    await registerWallet(wallet);
    signer = new HashicorpVaultSigner(
      BASE_URL,
      TOKEN,
      wallet.address,
      ethers.provider,
    );
    assert.equal(wallet.address, signer.address);

    unknownSigner = new HashicorpVaultSigner(
      BASE_URL,
      TOKEN,
      ethers.Wallet.createRandom().address,
      ethers.provider,
    );
  });

  afterEach(() => sandbox.restore());

  describe('signMessage', () => {
    const dataToSign = 'bou';

    it('should returns same signature between Wallet and HashicorpVaultSigner', async () => {
      const signature1 = await wallet.signMessage(dataToSign);
      const signature2 = await signer.signMessage(dataToSign);
      assert.equal(signature2, signature1);
      assert.equal(
        signer.address,
        verifyMessage(dataToSign, splitSignature(signature2)),
      );
    });

    it('should throw error for unknown address', async () => {
      await assert.rejects(
        async () => await unknownSigner.signMessage(dataToSign),
        {
          name: 'AxiosError',
          message: 'Request failed with status code 500',
        },
      );
    });
  });

  describe('signTransaction', () => {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const ONE_GWEI = 1_000_000_000;
    const lockedAmount = ONE_GWEI;
    let Lock: ethers.Contract;
    let unlockTime: number;

    before(async () => {
      unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      Lock = await ethers.getContractFactory('Lock');
    });

    beforeEach(() => {
      sandbox.spy(HashicorpVaultSigner.prototype, 'signTransaction');
    });

    it('should call signTransaction from contract deploying', async () => {
      let lock = await Lock.deploy(unlockTime, {
        value: lockedAmount,
      });
      assert.equal(HashicorpVaultSigner.prototype.signTransaction.callCount, 0);

      lock = await Lock.connect(signer).deploy(unlockTime, {
        value: lockedAmount,
      });
      assert.equal(HashicorpVaultSigner.prototype.signTransaction.callCount, 1);
      const {lastArg, returnValue} =
        HashicorpVaultSigner.prototype.signTransaction.getCall(0);
      assert.equal(lastArg.from, signer.address);
      const signedTx = parseTransaction(await returnValue);
      assert.equal(signedTx.from, signer.address);
      assert.equal(signedTx.data, lastArg.data);
    });

    it('should throw error for unknown address', async () => {
      await assert.rejects(
        async () =>
          await Lock.connect(unknownSigner).deploy(unlockTime, {
            value: lockedAmount,
          }),
        {
          name: 'AxiosError',
          message: 'Request failed with status code 500',
        },
      );
      assert.equal(HashicorpVaultSigner.prototype.signTransaction.callCount, 1);
      const {lastArg} =
        HashicorpVaultSigner.prototype.signTransaction.getCall(0);
      assert.equal(lastArg.from, unknownSigner.address);
    });
  });
});

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
import {ethers, Wallet} from 'ethers';
import axios, {AxiosRequestConfig} from 'axios';
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
  let wallet1: Wallet;
  let wallet2: Wallet;
  let signer1: HashicorpVaultSigner;
  let signer2: HashicorpVaultSigner;

  before(async () => {
    wallet1 = ethers.Wallet.createRandom();
    wallet2 = ethers.Wallet.createRandom();
    await registerWallet(wallet1);
    signer1 = new HashicorpVaultSigner(BASE_URL, TOKEN, wallet1.address);
    signer2 = new HashicorpVaultSigner(BASE_URL, TOKEN, wallet2.address);
    assert.equal(wallet1.address, signer1.address);
    assert.equal(wallet2.address, signer2.address);
  });

  describe('signMessage', () => {
    const dataToSign = 'bou';

    it('should returns same signature between Wallet and HashicorpVaultSigner', async () => {
      const signature1 = await wallet1.signMessage(dataToSign);
      const signature2 = await signer1.signMessage(dataToSign);
      assert.equal(signature2, signature1);
      assert.equal(
        signer1.address,
        verifyMessage(dataToSign, splitSignature(signature2)),
      );
    });

    it('should throw error for unknown address', async () => {
      await assert.rejects(async () => await signer2.signMessage(dataToSign), {
        name: 'AxiosError',
        message: 'Request failed with status code 500',
      });
    });
  });
});

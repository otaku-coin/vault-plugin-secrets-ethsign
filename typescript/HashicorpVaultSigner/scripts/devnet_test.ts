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

import path from 'path';
import {strict as assert} from 'assert';
import process from 'process';
import {ethers, Provider, Wallet} from 'hardhat';
import keythereum from 'keythereum';
import axios, {AxiosRequestConfig} from 'axios';
import delay from 'delay';
import sinon from 'sinon';
import {HashicorpVaultSigner} from '../src.ts/index';

async function importPrivateKey(datadir: string, address: string): Buffer {
  const keyObject = keythereum.importFromFile(address, datadir);
  const enc = new TextEncoder();
  const privateKey = keythereum.recover(enc.encode(''), keyObject);
  return privateKey;
}

async function importWallet(
  datadir: string,
  address: string,
  provider?: Provider,
): Wallet {
  const privateKey = await importPrivateKey('dev-chain', address);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log('recover account', wallet.address);
  return wallet;
}

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
  await axios(config);
}

async function createSigner(provider?: Provider): Wallet {
  const wallet = ethers.Wallet.createRandom().connect(provider);
  await registerWallet(wallet);
  return new HashicorpVaultSigner(wallet.address, BASE_URL, TOKEN, provider);
}

async function sendAndSendBack(
  provider: ethers.Provder,
  wallet: ethers.Wallet,
  signer: HashicorpVaultSigner,
) {
  // send 1 eth
  console.log('sending 1 ETH from account to signer');
  console.log(
    'wallet balance',
    (await provider.getBalance(wallet.address)).toString(),
  );
  console.log(
    'signer balance',
    (await provider.getBalance(signer.address)).toString(),
  );

  const oneEth = ethers.utils.parseEther('1');
  let receipt = await (
    await wallet.sendTransaction({
      to: signer.address,
      value: oneEth,
    })
  ).wait();
  assert.equal(receipt.from, wallet.address);
  assert.equal(receipt.to, signer.address);
  let balance = await provider.getBalance(signer.address);
  assert.deepEqual(balance, ethers.BigNumber.from(oneEth));
  console.log('signer balance', balance.toString());

  // send back 0.0001 eth: testing signer's sendTransaction
  console.log('sending 0.0001 ETH from signer to account');
  console.log(
    'wallet balance',
    (await provider.getBalance(wallet.address)).toString(),
  );
  console.log(
    'signer balance',
    (await provider.getBalance(signer.address)).toString(),
  );

  const amount = ethers.utils.parseEther('0.0001');
  const tx = await signer.sendTransaction({
    to: wallet.address,
    value: amount,
  });
  await tx.wait();

  const {lastArg, returnValue} =
    HashicorpVaultSigner.prototype.signTransaction.lastCall;
  const signedTx = ethers.utils.parseTransaction(await returnValue);

  assert.equal(tx.type, lastArg.type);
  assert.equal(tx.from, signer.address);
  assert.equal(tx.from, lastArg.from);
  assert.equal(tx.to, wallet.address);
  assert.equal(tx.to, lastArg.to);
  assert.equal(tx.nonce, 0);
  assert.equal(tx.nonce, lastArg.nonce);
  assert.equal(tx.gasPrice, null);
  assert.equal(tx.data, signedTx.data);
  assert.equal(tx.chainId, lastArg.chainId);
  assert.deepEqual(tx.value, ethers.BigNumber.from(lastArg.value));
  assert.deepEqual(tx.gasLimit, lastArg.gasLimit);
  assert.deepEqual(tx.maxFeePerGas, lastArg.maxFeePerGas);
  assert.deepEqual(tx.maxPriorityFeePerGas, lastArg.maxPriorityFeePerGas);
  assert.deepEqual(tx.accessList, signedTx.accessList);
  assert.equal(tx.r, signedTx.r);
  assert.equal(tx.s, signedTx.s);
  assert.equal(tx.v, signedTx.v);
}

async function deployAndVerify(
  provider: ethers.Provder,
  signer: HashicorpVaultSigner,
) {
  // deploy from signer
  const currentTimestampInSeconds = Math.round(Date.now() / 1000);
  // lock 30 seconds, must greater than block period
  const unlockTime = currentTimestampInSeconds + 30;
  const lockedAmount = ethers.utils.parseEther('0.1');

  console.log('deploying Lock contract');
  const Lock = await ethers.getContractFactory('Lock', signer);
  const lock = await Lock.deploy(unlockTime, {
    value: lockedAmount,
  });
  await lock.deployed();
  const {lastArg, returnValue} =
    HashicorpVaultSigner.prototype.signTransaction.lastCall;
  const signedTx = ethers.utils.parseTransaction(await returnValue);

  let tx = lock.deployTransaction;
  assert.equal(tx.type, lastArg.type);
  assert.equal(tx.from, signer.address);
  assert.equal(tx.from, lastArg.from);
  assert.equal(tx.to, null);
  assert.equal(tx.nonce, 1);
  assert.equal(tx.nonce, lastArg.nonce);
  assert.equal(tx.gasPrice, null);
  assert.equal(tx.data, lastArg.data);
  assert.equal(tx.chainId, lastArg.chainId);
  assert.deepEqual(tx.value, ethers.BigNumber.from(lastArg.value));
  assert.deepEqual(tx.gasLimit, lastArg.gasLimit);
  assert.deepEqual(tx.maxFeePerGas, lastArg.maxFeePerGas);
  assert.deepEqual(tx.maxPriorityFeePerGas, lastArg.maxPriorityFeePerGas);
  assert.deepEqual(tx.accessList, signedTx.accessList);
  assert.equal(tx.r, signedTx.r);
  assert.equal(tx.s, signedTx.s);
  assert.equal(tx.v, signedTx.v);

  let contractBalance = await provider.getBalance(lock.address);
  assert.deepEqual(contractBalance, ethers.BigNumber.from(lockedAmount));
  console.log('contract balance', contractBalance.toString());

  // call a read method
  console.log('call owner');
  const owner = await lock.owner();
  assert.equal(owner, signer.address);

  // call a write method
  console.log('call withdraw and fail');
  try {
    // locked yet
    await (await lock.withdraw()).wait();
    // assert.rejects does not fit here
    assert.fail();
  } catch (err) {
    assert.ok(err);
    console.log('ok, rejected');
  }

  console.log('wait 30 + 15 seconds');
  await delay(45 * 1000);

  console.log('call withdraw');
  tx = await lock.withdraw();
  assert.equal(tx.nonce, 3);
  let receipt = await tx.wait();
  assert.equal(receipt.from, signer.address);
  assert.equal(receipt.to, lock.address);
  assert.equal(receipt.contractAddress, null);

  contractBalance = await provider.getBalance(lock.address);
  assert.deepEqual(contractBalance, ethers.BigNumber.from(0));
  console.log('contract balance', contractBalance.toString());
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    'http://127.0.0.1:8545',
  );
  const {chainId} = await provider.getNetwork();
  console.log('provider chainId', chainId);

  // rejects none dev chains
  assert.equal(chainId, 1337);

  const [account] = await provider.listAccounts();
  const wallet = await importWallet('dev-chain', account, provider);
  console.log('account is', account);

  let sandbox = sinon.createSandbox();
  sandbox.spy(HashicorpVaultSigner.prototype, 'signTransaction');
  sandbox.spy(HashicorpVaultSigner.prototype, 'signDigest');

  const signer = await createSigner(provider);
  signer.estimater = wallet;
  console.log('signer is', signer.address);

  assert.equal(HashicorpVaultSigner.prototype.signTransaction.callCount, 0);
  assert.equal(HashicorpVaultSigner.prototype.signDigest.callCount, 0);

  await sendAndSendBack(provider, wallet, signer);
  assert.equal(HashicorpVaultSigner.prototype.signTransaction.callCount, 1);
  assert.equal(HashicorpVaultSigner.prototype.signDigest.callCount, 1);

  await deployAndVerify(provider, signer);
  assert.equal(HashicorpVaultSigner.prototype.signTransaction.callCount, 4);
  assert.equal(HashicorpVaultSigner.prototype.signDigest.callCount, 4);

  sandbox.restore();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

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

import { strict as assert } from "assert";
import http from "http";
import https from "https";
import { ethers, config } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatNetworkHDAccountsConfig } from "hardhat/types";
import { Wallet } from "ethers";
import axios, { AxiosRequestConfig } from "axios";
import sinon from "sinon";
import { HashicorpVaultSigner } from "../src.ts/index";
import { createMockServer } from "./mock";

const tcpPortUsed = require("tcp-port-used");

const {
  arrayify,
  verifyMessage,
  hashMessage,
  splitSignature,
  parseTransaction,
} = ethers.utils;

// Start mock server if useMockServer is true and localhost:8200 port is free.
// Otherwise, connect to BASE_URL vault server.
const useMockServer = true;

// NOTE To test with self signed certificate enabled vault server,
// set useMockServer = false, BASE_URL to `https` URL,
// set tokens to your token, and enable httpsAgent of defaultAxiosRequestConfig
// that comment-outed below.
const BASE_URL = "http://localhost:8200";
const ADMIN_TOKEN = "root";
const DEV_TOKEN = "root";
const defaultAxiosRequestConfig = {
  /*
  httpsAgent: new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false,
    // required IPv6 access to MacOSX localhost, otherwise I don't know
    family: 6,
  }),
  */
};

async function registerWallet(wallet: Wallet) {
  const config: AxiosRequestConfig = {
    ...defaultAxiosRequestConfig,
    method: "post",
    url: `${BASE_URL}/v1/ethereum/accounts`,
    responseType: "json",
    data: { privateKey: wallet.privateKey },
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  };
  const resp = await axios(config);
}

describe("HashicorpVaultSigner", () => {
  let server: http.Server | undefined;
  before(async () => {
    if (await tcpPortUsed.check(8200, "localhost")) {
      console.log("Skip mock server");
    } else {
      server = createMockServer();
    }
  });
  after(() => server?.close());

  describe("constructors and related", () => {
    describe("old style", () => {
      it("should set options with 4 arguments", () => {
        const signer = new HashicorpVaultSigner(
          "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
          "http://example.com",
          "TOKEN",
          ethers.provider
        );
        assert.equal(
          signer.signDigestUrl(),
          "http://example.com/v1/ethereum/accounts/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/sign_digest"
        );
        assert.deepEqual(signer.convineAxiosRequestConfig({}), {
          headers: { Authorization: "Bearer TOKEN" },
        });
        assert.deepEqual(signer.provider, ethers.provider);
      });

      it("should set options with 3 arguments", () => {
        const signer = new HashicorpVaultSigner(
          "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
          "http://example.com",
          "TOKEN"
        );
        assert.equal(
          signer.signDigestUrl(),
          "http://example.com/v1/ethereum/accounts/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/sign_digest"
        );
        assert.deepEqual(signer.convineAxiosRequestConfig({}), {
          headers: { Authorization: "Bearer TOKEN" },
        });
        assert.deepEqual(signer.provider, undefined);
      });
    });

    describe("with HashicorpVaultSignerConfig", () => {
      it("should set options with 3 arguments nor pluginPath", () => {
        const signer = new HashicorpVaultSigner(
          "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
          {
            baseUrl: "https://example.com",
            token: "token",
            axiosRequestConfig: {
              baseURL: "https://example.com",
              headers: { "X-HEADER": "defined" },
            },
          },
          ethers.provider
        );

        assert.equal(
          signer.signDigestUrl(),
          "https://example.com/v1/ethereum/accounts/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/sign_digest"
        );
        assert.deepEqual(signer.convineAxiosRequestConfig({}), {
          baseURL: "https://example.com",
          headers: { Authorization: "Bearer token", "X-HEADER": "defined" },
        });
        assert.deepEqual(signer.provider, ethers.provider);
      });

      it("should set options with 2 arguments nor pluginPath", () => {
        const signer = new HashicorpVaultSigner(
          "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
          {
            baseUrl: "https://example.com",
            token: "token",
            axiosRequestConfig: {
              baseURL: "https://example.com",
              headers: { "X-HEADER": "defined" },
            },
          }
        );

        assert.equal(
          signer.signDigestUrl(),
          "https://example.com/v1/ethereum/accounts/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/sign_digest"
        );
        assert.deepEqual(signer.convineAxiosRequestConfig({}), {
          baseURL: "https://example.com",
          headers: { Authorization: "Bearer token", "X-HEADER": "defined" },
        });
        assert.deepEqual(signer.provider, undefined);
      });

      it("should set options with 3 arguments and pluginPath", () => {
        const signer = new HashicorpVaultSigner(
          "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
          {
            baseUrl: "https://example.com",
            token: "token",
            pluginPath: "ethhsv",
            axiosRequestConfig: {
              baseURL: "https://example.com",
              headers: { "X-HEADER": "defined" },
            },
          },
          ethers.provider
        );

        assert.equal(
          signer.signDigestUrl(),
          "https://example.com/v1/ethhsv/accounts/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/sign_digest"
        );
        assert.deepEqual(signer.convineAxiosRequestConfig({}), {
          baseURL: "https://example.com",
          headers: { Authorization: "Bearer token", "X-HEADER": "defined" },
        });
        assert.deepEqual(signer.provider, ethers.provider);
      });
    });
  });

  describe("signature", () => {
    const sandbox = sinon.createSandbox();
    let wallet: Wallet;
    let signer: HashicorpVaultSigner;
    let unknownSigner: HashicorpVaultSigner;

    before(async () => {
      const options = {
        baseUrl: BASE_URL,
        token: DEV_TOKEN,
        axiosRequestConfig: defaultAxiosRequestConfig,
      };

      const accounts = config.networks.hardhat
        .accounts as HardhatNetworkHDAccountsConfig;
      wallet = Wallet.fromMnemonic(accounts.mnemonic, `${accounts.path}/1`);
      await registerWallet(wallet);
      signer = new HashicorpVaultSigner(
        wallet.address,
        options,
        ethers.provider
      );
      assert.equal(wallet.address, signer.address);

      unknownSigner = new HashicorpVaultSigner(
        ethers.Wallet.createRandom().address,
        options,
        ethers.provider
      );
    });

    afterEach(() => sandbox.restore());

    describe("signMessage", () => {
      const dataToSign = "bou";

      it("should returns same signature between Wallet and HashicorpVaultSigner", async () => {
        const signature1 = await wallet.signMessage(dataToSign);
        const signature2 = await signer.signMessage(dataToSign);
        assert.equal(signature2, signature1);
        assert.equal(
          signer.address,
          verifyMessage(dataToSign, splitSignature(signature2))
        );
      });

      it("should throw error for unknown address", async () => {
        await assert.rejects(
          async () => await unknownSigner.signMessage(dataToSign),
          {
            name: "AxiosError",
            message: "Request failed with status code 500",
          }
        );
      });
    });

    describe("signTransaction", () => {
      const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
      const ONE_GWEI = 1_000_000_000;
      const lockedAmount = ONE_GWEI;
      let unlockTime: number;
      let signTransactionSpy: sinon.SinonSpy;

      before(async () => {
        unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      });

      beforeEach(() => {
        signTransactionSpy = sandbox.spy(
          HashicorpVaultSigner.prototype,
          "signTransaction"
        );
      });

      it("should call signTransaction from contract deploying", async () => {
        const [deployer] = await ethers.getSigners();
        assert.notEqual(signer.address, deployer.address);

        const Lock = await ethers.getContractFactory("Lock");
        const defaultContract = await Lock.deploy(unlockTime, {
          value: lockedAmount,
        });
        await defaultContract.deployed();
        const defaultTx = await ethers.provider.getTransaction(
          defaultContract.deployTransaction.hash
        );
        assert.equal(defaultTx.from, deployer.address);
        const defaultReceipt = await ethers.provider.getTransactionReceipt(
          defaultContract.deployTransaction.hash
        );
        assert.equal(signTransactionSpy.callCount, 0);

        const signerContract = await Lock.connect(signer).deploy(unlockTime, {
          value: lockedAmount,
        });
        await signerContract.deployed();

        const signerTx = await ethers.provider.getTransaction(
          signerContract.deployTransaction.hash
        );
        assert.equal(signerTx.from, signer.address);
        const signerReceipt = await ethers.provider.getTransactionReceipt(
          signerContract.deployTransaction.hash
        );

        assert.equal(signTransactionSpy.callCount, 1);
        const { lastArg, returnValue } = signTransactionSpy.lastCall;
        assert.equal(lastArg.from, signer.address);
        const tx = parseTransaction(await returnValue);
        assert.equal(tx.from, signer.address);
        assert.equal(tx.data, lastArg.data);

        assert.equal(lastArg.type, signerTx.type);
        assert.equal(lastArg.from, signerTx.from);
        assert.equal(lastArg.data, signerTx.data);
        assert.equal(lastArg.chainId, signerTx.chainId);
        assert.equal(lastArg.nonce, signerTx.nonce);
        assert.deepEqual(ethers.BigNumber.from(lastArg.value), signerTx.value);
        assert.deepEqual(lastArg.gasLimit, signerTx.gasLimit);
        assert.deepEqual(lastArg.maxFeePerGas, signerTx.maxFeePerGas);
        assert.deepEqual(
          lastArg.maxPriorityFeePerGas,
          signerTx.maxPriorityFeePerGas
        );
        assert.deepEqual(tx.accessList, signerTx.accessList);
        assert.equal(tx.r, signerTx.r);
        assert.equal(tx.s, signerTx.s);
        assert.equal(tx.v, signerTx.v);
        assert.equal(signerTx.to, null);
        assert.equal(signerTx.from, signer.address);

        assert.equal(lastArg.type, defaultTx.type);
        assert.notEqual(lastArg.from, defaultTx.from);
        assert.equal(lastArg.data, defaultTx.data);
        assert.equal(lastArg.chainId, defaultTx.chainId);
        assert.deepEqual(ethers.BigNumber.from(lastArg.value), defaultTx.value);
        assert.deepEqual(lastArg.gasLimit, defaultTx.gasLimit);
        assert.equal(defaultTx.to, null);
        assert.equal(defaultTx.from, deployer.address);
        assert.deepEqual(defaultTx.accessList, defaultTx.accessList);

        assert.notEqual(signerTx.hash, defaultTx.hash);
        assert.notEqual(signerTx.r, defaultTx.r);
        assert.notEqual(signerTx.s, defaultTx.s);

        assert.equal(signerReceipt.contractAddress, signerContract.address);
        assert.equal(defaultReceipt.contractAddress, defaultContract.address);
        assert.deepEqual(signerReceipt.gasUsed, defaultReceipt.gasUsed);
        assert.deepEqual(
          signerReceipt.cumulativeGasUsed,
          defaultReceipt.cumulativeGasUsed
        );
      });

      it("should throw error for unknown address", async () => {
        const Lock = await ethers.getContractFactory("Lock");
        await assert.rejects(
          async () =>
            await Lock.connect(unknownSigner).deploy(unlockTime, {
              value: lockedAmount,
            }),
          {
            name: "AxiosError",
            message: "Request failed with status code 500",
          }
        );
        assert.equal(signTransactionSpy.callCount, 1);
        const { lastArg } = signTransactionSpy.lastCall;
        assert.equal(lastArg.from, unknownSigner.address);
      });
    });
  });
});

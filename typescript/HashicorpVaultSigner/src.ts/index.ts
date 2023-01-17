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

import {
  ethers,
  UnsignedTransaction,
  Signature,
  Bytes,
  BytesLike,
} from 'ethers';
import axios, {AxiosRequestConfig} from 'axios';

const {
  arrayify,
  hexlify,
  keccak256,
  getAddress,
  hashMessage,
  splitSignature,
  joinSignature,
  resolveProperties,
  serializeTransaction,
} = ethers.utils;

export class HashicorpVaultSigner extends ethers.Signer {
  readonly baseUrl: string;
  readonly token: string;
  readonly address: string;
  readonly provider: ethers.providers.Provider | undefined;

  constructor(
    baseUrl: string,
    token: string,
    address: string,
    provider?: ethers.providers.Provider,
  ) {
    super();

    // ethers.utils.defineReadOnly may cause `error TS2564: Property 'X' has
    // no initializer and is not definitely assigned in the constructor.` and
    // I don't known how to solve it.
    this.baseUrl = baseUrl;
    this.token = token;
    this.address = getAddress(address);
    this.provider = provider;
  }

  getAddress(): Promise<string> {
    return Promise.resolve(this.address);
  }

  async signDigest(digest: BytesLike): Promise<Signature> {
    const digestBytes = arrayify(digest);
    if (digestBytes.length !== 32) {
      ethers.logger.throwArgumentError('bad digest length', 'digest', digest);
    }
    const hash = hexlify(digestBytes);

    const address = this.address.toLowerCase();
    const url = `${this.baseUrl}/v1/ethereum/accounts/${address}/sign_digest`;
    const config: AxiosRequestConfig = {
      url,
      method: 'post',
      responseType: 'json',
      data: {hash},
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    };

    const resp = await axios(config);
    return splitSignature(resp.data.data.signature);
  }

  async signMessage(message: string | Bytes): Promise<string> {
    return joinSignature(await this.signDigest(hashMessage(message)));
  }

  async signTransaction(
    transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>,
  ): Promise<string> {
    const tx = await resolveProperties(transaction);
    if (tx.from != null) {
      if (getAddress(tx.from) !== this.address) {
        ethers.logger.throwArgumentError(
          'transaction from address mismatch',
          'transaction.from',
          transaction.from,
        );
      }
      delete tx.from;
    }

    const signature = await this.signDigest(
      keccak256(serializeTransaction(<UnsignedTransaction>tx)),
    );
    return serializeTransaction(<UnsignedTransaction>tx, signature);
  }

  connect(provider: ethers.providers.Provider): HashicorpVaultSigner {
    return new HashicorpVaultSigner(
      this.baseUrl,
      this.address,
      this.token,
      provider,
    );
  }
}

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

import http, {IncomingMessage, ServerResponse} from 'http';
import {ethers, utils, Wallet} from 'ethers';
const {joinSignature} = utils;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise(fulfil => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      fulfil(body);
    });
  });
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const body = await readBody(req);
  return JSON.parse(body);
}

const privateKeys = new Map<string, Wallet>();

async function accounts(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  let privateKey: string = body['privateKey'];
  privateKey = privateKey.replace('/^0x/', '');

  const wallet = new Wallet(privateKey);
  console.log(`Register address ${wallet.address.toLowerCase()}`);
  privateKeys.set(wallet.address.toLowerCase(), wallet);

  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({data: {address: wallet.address}}), 'utf-8');
}

async function sign(
  req: IncomingMessage,
  res: ServerResponse,
  address: string,
) {
  const wallet = privateKeys.get(address);
  if (!wallet) {
    throw new Error(`Unkonwn address ${address}`);
  }

  const body = await readJsonBody(req);
  const hash: string = body.hash!;

  const signature = joinSignature(wallet._signingKey().signDigest(hash));

  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({data: {signature}}), 'utf-8');
}

async function requestListener(req: IncomingMessage, res: ServerResponse) {
  console.log(req.url);

  try {
    if (req.url === '/v1/ethereum/accounts') {
      await accounts(req, res);
      return;
    }

    const matcher = req.url?.match(
      /^\/v1\/ethereum\/accounts\/(.*)\/sign_digest$/,
    );
    if (matcher != null) {
      await sign(req, res, matcher[1]);
      return;
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      throw err;
    }
  }

  res.writeHead(500, {'Content-Type': 'application/json'});
  res.end('{}', 'utf-8');
}

export function createMockServer(): http.Server {
  const server = http.createServer(requestListener);
  server.listen(8200);
  console.log('Starting mock server on :8200');
  return server;
}

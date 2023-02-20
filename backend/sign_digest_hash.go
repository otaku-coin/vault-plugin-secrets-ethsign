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

package backend

import (
	"crypto/ecdsa"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

func SignDigestHash(hash string, privateKey *ecdsa.PrivateKey) (string, error) {
	digest, err := hexutil.Decode(hash)
	if err != nil {
		return "", err
	}

	signature, err := crypto.Sign(digest, privateKey)
	if err != nil {
		return "", err
	}

	// see Ethereum yellow paper and
	// https://ethereum.stackexchange.com/questions/78929/whats-the-magic-numbers-meaning-of-27-or-28-in-vrs-use-to-ecrover-the-sender
	signature[64] += 27
	return hexutil.Encode(signature), nil
}

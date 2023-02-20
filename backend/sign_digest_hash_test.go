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
	"testing"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/assert"
)

func recoverSignature(hash string, signature string) (*ecdsa.PublicKey, error) {
	digest, err := hexutil.Decode(hash)
	if err != nil {
		return nil, nil
	}
	signatureBytes, err := hexutil.Decode(signature)
	if err != nil {
		return nil, nil
	}

	signatureBytes[64] -= 27
	return crypto.SigToPub(digest, signatureBytes)
}

func TestSignDigestHash(t *testing.T) {
	privateKey, err := crypto.HexToECDSA("ec85999367d32fbbe02dd600a2a44550b95274cc67d14375a9f0bce233f13ad2")
	assert.Nil(t, err)
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	assert.Equal(t, ok, true)

	// equals keccak256(toUtf8Bytes("ymdUoje0MeOe")) (have canonical effect)
	hash := "0xaf65200e5406afa5d05ce55ef0b239ed7200c38be4102b93d1b354b357f5debf"
	signature, err := SignDigestHash(hash, privateKey)
	assert.Nil(t, err)
	// the following signature calcurated by ethers.js's
	// wallet._signingKey().signDigest
	assert.Equal(t, signature, "0x07ea71aad4d80a1ec731aa8e182b2fc03fa33d0508870d178495e7f653f12949652915bbf1ba5faf53aa1c219ba2c5c057806aeb382d3b71519e3f1182cf00431c")

	sigPublicKeyECDSA, err := recoverSignature(hash, signature)
	assert.Nil(t, err)
	assert.Equal(t, sigPublicKeyECDSA, publicKeyECDSA)

	address := crypto.PubkeyToAddress(*sigPublicKeyECDSA).String()
	assert.Equal(t, address, "0xd5Bcc62D9b1087A5CfEC116C24D6187DD40fDf8A")

	// equals keccak256(toUtf8Bytes("PSCKpnCs1Pc7")) (not canonical effect)
	hash = "0x1eb788716336ddae8670d3d9f6608548ddfa5001d5fec18df7d366b0c8f777fc"
	signature, err = SignDigestHash(hash, privateKey)
	assert.Nil(t, err)
	// and from ethers.js
	assert.Equal(t, signature, "0x68fc99121ceea8dfdf3d229bd6cafa7e09a33859db579a3b886d65f933498d8d3838dc621de42e8356066293551e0fa84ea0a908a6c2836a2b6aa874747e29841b")

	sigPublicKeyECDSA, err = recoverSignature(hash, signature)
	assert.Nil(t, err)
	assert.Equal(t, sigPublicKeyECDSA, publicKeyECDSA)

	address = crypto.PubkeyToAddress(*sigPublicKeyECDSA).String()
	assert.Equal(t, address, "0xd5Bcc62D9b1087A5CfEC116C24D6187DD40fDf8A")
}

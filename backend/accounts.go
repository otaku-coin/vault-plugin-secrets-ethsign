// Copyright © 2020 Kaleido
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
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"regexp"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
	"golang.org/x/crypto/sha3"
)

const (
	// InvalidAddress intends to prevent empty address_to
	InvalidAddress string = "InvalidAddress"
)

// Account is an Ethereum account
type Account struct {
	Address    string `json:"address"`
	PrivateKey string `json:"private_key"`
	PublicKey  string `json:"public_key"`
}

func paths(b *backend) []*framework.Path {
	return []*framework.Path{
		pathCreateAndList(b),
		pathReadAndDelete(b),
		pathExport(b),
	}
}

func (b *backend) listAccounts(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	vals, err := req.Storage.List(ctx, "accounts/")
	if err != nil {
		b.Logger().Error("Failed to retrieve the list of accounts", "error", err)
		return nil, err
	}

	return logical.ListResponse(vals), nil
}

func (b *backend) createAccount(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	keyInput := data.Get("privateKey").(string)
	var privateKey *ecdsa.PrivateKey
	var privateKeyString string
	var err error

	if keyInput != "" {
		re := regexp.MustCompile("[0-9a-fA-F]{64}$")
		key := re.FindString(keyInput)
		if key == "" {
			b.Logger().Error("Input private key did not parse successfully", "privateKey", keyInput)
			return nil, fmt.Errorf("privateKey must be a 32-byte hexidecimal string")
		}
		privateKey, err = crypto.HexToECDSA(key)
		if err != nil {
			b.Logger().Error("Error reconstructing private key from input hex", "error", err)
			return nil, fmt.Errorf("Error reconstructing private key from input hex")
		}
		privateKeyString = key
	} else {
		privateKey, _ = crypto.GenerateKey()
		privateKeyBytes := crypto.FromECDSA(privateKey)
		privateKeyString = hexutil.Encode(privateKeyBytes)[2:]
	}

	defer ZeroKey(privateKey)

	publicKey := privateKey.Public()
	publicKeyECDSA, _ := publicKey.(*ecdsa.PublicKey)
	publicKeyBytes := crypto.FromECDSAPub(publicKeyECDSA)
	publicKeyString := hexutil.Encode(publicKeyBytes)[4:]

	hash := sha3.NewLegacyKeccak256()
	hash.Write(publicKeyBytes[1:])
	address := hexutil.Encode(hash.Sum(nil)[12:])

	accountPath := fmt.Sprintf("accounts/%s", address)

	accountJSON := &Account{
		Address:    address,
		PrivateKey: privateKeyString,
		PublicKey:  publicKeyString,
	}

	entry, _ := logical.StorageEntryJSON(accountPath, accountJSON)
	err = req.Storage.Put(ctx, entry)
	if err != nil {
		b.Logger().Error("Failed to save the new account to storage", "error", err)
		return nil, err
	}

	return &logical.Response{
		Data: map[string]interface{}{
			"address": accountJSON.Address,
		},
	}, nil
}

func (b *backend) readAccount(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	address := data.Get("name").(string)
	b.Logger().Info("Retrieving account for address", "address", address)
	account, err := b.retrieveAccount(ctx, req, address)
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, fmt.Errorf("Account does not exist")
	}

	return &logical.Response{
		Data: map[string]interface{}{
			"address": account.Address,
		},
	}, nil
}

func (b *backend) exportAccount(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	address := data.Get("name").(string)
	b.Logger().Info("Retrieving account for address", "address", address)
	account, err := b.retrieveAccount(ctx, req, address)
	if err != nil {
		return nil, err
	}
	if account == nil {
		return nil, fmt.Errorf("Account does not exist")
	}

	return &logical.Response{
		Data: map[string]interface{}{
			"address":    account.Address,
			"privateKey": account.PrivateKey,
		},
	}, nil
}

func (b *backend) deleteAccount(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	address := data.Get("name").(string)
	account, err := b.retrieveAccount(ctx, req, address)
	if err != nil {
		b.Logger().Error("Failed to retrieve the account by address", "address", address, "error", err)
		return nil, err
	}
	if account == nil {
		return nil, nil
	}
	if err := req.Storage.Delete(ctx, fmt.Sprintf("accounts/%s", account.Address)); err != nil {
		b.Logger().Error("Failed to delete the account from storage", "address", address, "error", err)
		return nil, err
	}
	return nil, nil
}

func (b *backend) retrieveAccount(ctx context.Context, req *logical.Request, address string) (*Account, error) {
	var path string
	matched, err := regexp.MatchString("^(0x)?[0-9a-fA-F]{40}$", address)
	if !matched || err != nil {
		b.Logger().Error("Failed to retrieve the account, malformatted account address", "address", address, "error", err)
		return nil, fmt.Errorf("Failed to retrieve the account, malformatted account address")
	} else {
		// make sure the address has the "0x prefix"
		if address[:2] != "0x" {
			address = "0x" + address
		}
		path = fmt.Sprintf("accounts/%s", address)
		entry, err := req.Storage.Get(ctx, path)
		if err != nil {
			b.Logger().Error("Failed to retrieve the account by address", "path", path, "error", err)
			return nil, err
		}
		if entry == nil {
			// could not find the corresponding key for the address
			return nil, nil
		}
		var account Account
		_ = entry.DecodeJSON(&account)
		return &account, nil
	}
}

func ValidNumber(input string) *big.Int {
	if input == "" {
		return big.NewInt(0)
	}
	matched, err := regexp.MatchString("([0-9])", input)
	if !matched || err != nil {
		return nil
	}
	amount := math.MustParseBig256(input)
	return amount.Abs(amount)
}

func ZeroKey(k *ecdsa.PrivateKey) {
	b := k.D.Bits()
	for i := range b {
		b[i] = 0
	}
}

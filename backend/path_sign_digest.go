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
	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
)

func pathSignDigest(b *backend) *framework.Path {
	return &framework.Path{
		Pattern:      "accounts/" + framework.GenericNameRegex("name") + "/sign_digest",
		HelpSynopsis: "Sign digest hash string.",
		HelpDescription: `

    Sign digest hash. It is similar ethers.js Wallet.signDigest method.

    `,
		Fields: map[string]*framework.FieldSchema{
			"name": &framework.FieldSchema{Type: framework.TypeString},
			"hash": &framework.FieldSchema{
				Type:        framework.TypeString,
				Description: "Hash to sign, hexdecimal string with 0x prefix.",
			},
		},
		ExistenceCheck: b.pathExistenceCheck,
		Callbacks: map[logical.Operation]framework.OperationFunc{
			logical.CreateOperation: b.signDigest,
		},
	}
}

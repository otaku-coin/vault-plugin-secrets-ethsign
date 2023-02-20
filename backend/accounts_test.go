// Copyright © 2020 Kaleido
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
	"context"
	"errors"
	"math/big"
	"reflect"
	"testing"
	"time"

	log "github.com/hashicorp/go-hclog"
	"github.com/hashicorp/vault/sdk/helper/logging"
	"github.com/hashicorp/vault/sdk/logical"

	"github.com/stretchr/testify/assert"
)

func getBackend(t *testing.T) (logical.Backend, logical.Storage) {
	config := &logical.BackendConfig{
		Logger:      logging.NewVaultLogger(log.Trace),
		System:      &logical.StaticSystemView{},
		StorageView: &logical.InmemStorage{},
		BackendUUID: "test",
	}

	b, err := Factory(context.Background(), config)
	if err != nil {
		t.Fatalf("unable to create backend: %v", err)
	}

	// Wait for the upgrade to finish
	time.Sleep(time.Second)

	return b, config.StorageView
}

type StorageMock struct {
	switches []int
}

func (s StorageMock) List(c context.Context, path string) ([]string, error) {
	if s.switches[0] == 1 {
		return []string{"key1", "key2"}, nil
	} else {
		return nil, errors.New("Bang for List!")
	}
}
func (s StorageMock) Get(c context.Context, path string) (*logical.StorageEntry, error) {
	if s.switches[1] == 2 {
		var entry logical.StorageEntry
		return &entry, nil
	} else if s.switches[1] == 1 {
		return nil, nil
	} else {
		return nil, errors.New("Bang for Get!")
	}
}
func (s StorageMock) Put(c context.Context, se *logical.StorageEntry) error {
	return errors.New("Bang for Put!")
}
func (s StorageMock) Delete(c context.Context, path string) error {
	return errors.New("Bang for Delete!")
}

func newStorageMock() StorageMock {
	var sm StorageMock
	sm.switches = []int{0, 0, 0, 0}
	return sm
}

func TestAccounts(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)

	// create key1
	req := logical.TestRequest(t, logical.UpdateOperation, "accounts")
	storage := req.Storage
	res, err := b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}

	address1 := res.Data["address"].(string)

	// create key2
	req = logical.TestRequest(t, logical.UpdateOperation, "accounts")
	req.Storage = storage
	res, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}

	address2 := res.Data["address"].(string)

	req = logical.TestRequest(t, logical.ListOperation, "accounts")
	req.Storage = storage
	resp, err := b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}

	expected1 := &logical.Response{
		Data: map[string]interface{}{
			"keys": []string{address1, address2},
		},
	}
	expected2 := &logical.Response{
		Data: map[string]interface{}{
			"keys": []string{address2, address1},
		},
	}

	if !reflect.DeepEqual(resp, expected1) && !reflect.DeepEqual(resp, expected2) {
		t.Fatalf("bad response.\n\nexpected: %#v\n\nGot: %#v", expected1, resp)
	}

	// read account by address
	expected := &logical.Response{
		Data: map[string]interface{}{
			"address": address1,
		},
	}
	req = logical.TestRequest(t, logical.ReadOperation, "accounts/"+address1)
	req.Storage = storage
	resp, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !reflect.DeepEqual(resp, expected) {
		t.Fatalf("bad response.\n\nexpected: %#v\n\nGot: %#v", expected, resp)
	}

	// read account by address without the "0x" prefix
	req = logical.TestRequest(t, logical.ReadOperation, "accounts/"+address1[2:])
	req.Storage = storage
	resp, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !reflect.DeepEqual(resp, expected) {
		t.Fatalf("bad response.\n\nexpected: %#v\n\nGot: %#v", expected, resp)
	}

	// delete key by name
	req = logical.TestRequest(t, logical.DeleteOperation, "accounts/"+address1)
	req.Storage = storage
	if _, err := b.HandleRequest(context.Background(), req); err != nil {
		t.Fatalf("err: %v", err)
	}

	expected = &logical.Response{
		Data: map[string]interface{}{},
	}

	// delete key by address
	req = logical.TestRequest(t, logical.DeleteOperation, "accounts/"+address2)
	req.Storage = storage
	if _, err := b.HandleRequest(context.Background(), req); err != nil {
		t.Fatalf("err: %v", err)
	}

	req = logical.TestRequest(t, logical.ListOperation, "accounts")
	req.Storage = storage
	resp, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}

	if !reflect.DeepEqual(resp, expected) {
		t.Fatalf("bad response.\n\nexpected: %#v\n\nGot: %#v", expected, resp)
	}

	// import key3
	req = logical.TestRequest(t, logical.UpdateOperation, "accounts")
	req.Storage = storage
	data := map[string]interface{}{
		"privateKey": "ec85999367d32fbbe02dd600a2a44550b95274cc67d14375a9f0bce233f13ad2",
	}
	req.Data = data
	res, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	address3 := res.Data["address"].(string)
	assert.Equal("0xd5bcc62d9b1087a5cfec116c24d6187dd40fdf8a", address3)

	// import key4 using '0x' prefix
	req = logical.TestRequest(t, logical.UpdateOperation, "accounts")
	req.Storage = storage
	data = map[string]interface{}{
		"privateKey": "0xec85999367d32fbbe02dd600a2a44550b95274cc67d14375a9f0bce233f13ad2",
	}
	req.Data = data
	res, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	address4 := res.Data["address"].(string)
	assert.Equal("0xd5bcc62d9b1087a5cfec116c24d6187dd40fdf8a", address4)

	// export key3
	req = logical.TestRequest(t, logical.ReadOperation, "export/accounts/0xd5bcc62d9b1087a5cfec116c24d6187dd40fdf8a")
	req.Storage = storage
	res, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assert.Equal("ec85999367d32fbbe02dd600a2a44550b95274cc67d14375a9f0bce233f13ad2", res.Data["privateKey"])

	// validate de-dup of same private keys imported multiple times
	req = logical.TestRequest(t, logical.ListOperation, "accounts")
	req.Storage = storage
	resp, _ = b.HandleRequest(context.Background(), req)
	assert.Equal(1, len(resp.Data))

	// sign digest
	req = logical.TestRequest(t, logical.CreateOperation, "accounts/"+address4+"/sign_digest")
	req.Storage = storage
	data = map[string]interface{}{
		"hash": "0xaf65200e5406afa5d05ce55ef0b239ed7200c38be4102b93d1b354b357f5debf",
	}
	req.Data = data
	resp, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	signature := resp.Data["signature"].(string)
	assert.Equal(signature, "0x07ea71aad4d80a1ec731aa8e182b2fc03fa33d0508870d178495e7f653f12949652915bbf1ba5faf53aa1c219ba2c5c057806aeb382d3b71519e3f1182cf00431c")

	// sign digest
	req = logical.TestRequest(t, logical.CreateOperation, "accounts/"+address4+"/sign_digest")
	req.Storage = storage
	data = map[string]interface{}{
		"hash": "0x1eb788716336ddae8670d3d9f6608548ddfa5001d5fec18df7d366b0c8f777fc",
	}
	req.Data = data
	resp, err = b.HandleRequest(context.Background(), req)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	signature = resp.Data["signature"].(string)
	assert.Equal(signature, "0x68fc99121ceea8dfdf3d229bd6cafa7e09a33859db579a3b886d65f933498d8d3838dc621de42e8356066293551e0fa84ea0a908a6c2836a2b6aa874747e29841b")
}

func TestListAccountsFailure1(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ListOperation, "accounts")
	sm := newStorageMock()
	req.Storage = sm
	_, err := b.HandleRequest(context.Background(), req)

	assert.Equal("Bang for List!", err.Error())
}

func TestCreateAccountsFailure1(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.UpdateOperation, "accounts")
	sm := newStorageMock()
	req.Storage = sm
	_, err := b.HandleRequest(context.Background(), req)

	assert.Equal("Bang for Put!", err.Error())
}

func TestCreateAccountsFailure2(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.UpdateOperation, "accounts")
	data := map[string]interface{}{
		"privateKey": "abc",
	}
	req.Data = data
	sm := newStorageMock()
	req.Storage = sm
	_, err := b.HandleRequest(context.Background(), req)

	assert.Equal("privateKey must be a 32-byte hexidecimal string", err.Error())
}

func TestCreateAccountsFailure3(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.UpdateOperation, "accounts")
	data := map[string]interface{}{
		// use N for the secp256k1 curve to trigger an error
		"privateKey": "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
	}
	req.Data = data
	sm := newStorageMock()
	req.Storage = sm
	_, err := b.HandleRequest(context.Background(), req)

	assert.Equal("Error reconstructing private key from input hex", err.Error())
}

func TestReadAccountsFailure1(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ReadOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	req.Storage = sm
	_, err := b.HandleRequest(context.Background(), req)

	assert.Equal("Bang for Get!", err.Error())
}

func TestReadAccountsFailure2(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ReadOperation, "accounts/key1")
	sm := newStorageMock()
	sm.switches[1] = 1
	req.Storage = sm
	resp, _ := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
}

func TestReadAccountsFailure3(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ReadOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	req.Storage = sm
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Bang for Get!", err.Error())
}

func TestReadAccountsFailure4(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ReadOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	sm.switches[1] = 1
	req.Storage = sm
	resp, _ := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
}

func TestExportAccountsFailure1(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ReadOperation, "export/accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	req.Storage = sm
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Bang for Get!", err.Error())
}

func TestExportAccountsFailure2(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.ReadOperation, "export/accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	sm.switches[1] = 1
	req.Storage = sm
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Account does not exist", err.Error())
}

func TestDeleteAccountsFailure1(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.DeleteOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	req.Storage = sm
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Bang for Get!", err.Error())
}

func TestDeleteAccountsFailure2(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.DeleteOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	sm.switches[1] = 1
	req.Storage = sm
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Nil(err)
}

func TestDeleteAccountsFailure3(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.DeleteOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84")
	sm := newStorageMock()
	sm.switches[1] = 2
	req.Storage = sm
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Bang for Delete!", err.Error())
}

func TestSignDigestFailure1(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.CreateOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84/sign_digest")
	sm := newStorageMock()
	req.Storage = sm
	req.Data["hash"] = "0xabc"
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("hex string of odd length", err.Error())
}

func TestSignDigestFailure2(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.CreateOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84/sign_digest")
	sm := newStorageMock()
	req.Storage = sm
	req.Data["hash"] = "0xabcd"
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Error retrieving signing account 0xf809410b0d6f047c603deb311979cd413e025a84", err.Error())
}

func TestSignDigestFailure3(t *testing.T) {
	assert := assert.New(t)

	b, _ := getBackend(t)
	req := logical.TestRequest(t, logical.CreateOperation, "accounts/0xf809410b0d6f047c603deb311979cd413e025a84/sign_digest")
	sm := newStorageMock()
	sm.switches[1] = 1
	req.Storage = sm
	req.Data["hash"] = "0xabcd"
	resp, err := b.HandleRequest(context.Background(), req)

	assert.Nil(resp)
	assert.Equal("Signing account 0xf809410b0d6f047c603deb311979cd413e025a84 does not exist", err.Error())
}

func contains(arr []*big.Int, value *big.Int) bool {
	for _, a := range arr {
		if a.Cmp(value) == 0 {
			return true
		}
	}
	return false
}

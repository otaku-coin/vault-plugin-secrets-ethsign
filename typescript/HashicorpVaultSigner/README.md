# HashicorpVaultSigner

ethers.js Signer subclass for Hashicorp Vault and modified
vault-plugin-secrets-ethsign plugin.

## Installation

Installer does not implement yet.
Copy and import src.ts/index.ts to your project.

## Usage

Instanciate HashicorpVaultSigner object with Vault API Base URL `VAULT_ADDR`
(Vault server shows it you as `VAULT_ADDR` environment on wakeup),
Vault token `TOKEN`, and Ethereum address on ethsign vault plugin.

```
const signer = new HashicorpVaultSigner(
  VAULT_ADDR,
  TOKEN,
  ADDRESS,
  ethers.provider,
);

const contract = await YourContract.connect(signer).deploy();
await lock.deployed();
```

## Testing

We have two type tests hardhat tests and geth developer mode network tests.
Install HashiCorp Vault before all tests, and install go-ethereum (geth) before
private network tests.
See [Installing Vault](https://developer.hashicorp.com/vault/docs/install),
[Installing Geth](https://geth.ethereum.org/docs/getting-started/installing-geth)
and [Developer mode](https://geth.ethereum.org/docs/developers/dapp-developer/dev-mode)
for more details.

packages.json contains test helper scripts. You can run test tasks via
`npm run` command.

### NOTE before testing

For protecting you and your environment, We recommended shutdown your development machine from the Internet on testing.

### hardhat tests

Run Vault Development Mode Server with vault-plugin-secrets-ethsign plugin
before tests. You can run it from `vaultdev` npm script.

```
npm run vaultdev
```

Open other console and run hardhat tests by `test` npm script.

```
npm run test
```

Stop `vaultdev` when finish tests.

### geth developer mode network tests

Run Vault Development Mode Server with vault-plugin-secrets-ethsign plugin
and Developer Mode go-ethereum (geth) server before tests.
You can run it from `vaultdev` and `gethdev` npm scripts.

```
npm run vaultdev
```

```
npm run gethdev
```

Open other console and run geth developer mode network tests by
`devnet_test` npm script.

```
npm run devnet_test
```

Stop `vaultdev` and `gethdev` when finish tests.

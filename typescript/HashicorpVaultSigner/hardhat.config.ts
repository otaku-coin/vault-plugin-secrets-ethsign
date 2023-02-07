import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    dev: {
      url: 'http://localhost:8545',
      chainId: 1337,
    }
  },
};

export default config;

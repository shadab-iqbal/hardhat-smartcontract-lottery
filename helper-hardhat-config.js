const { ethers } = require("hardhat");

const networkConfig = {
  5: {
    name: "goerli",
    vrfCoordinatorV2: "0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D", // from chainlink docs
    entranceFee: ethers.utils.parseEther("0.01"), // setting manually
    keyHash:
      "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15", // from chainlink docs
    subscriptionId: "8106",
    callbackGasLimit: "500000", // setting a random high value
    interval: "30",
  },
  31337: {
    name: "localhost",
    // we don't need vrfCoordinatorV2 address because we will be deploying mock and getting the address in the same file
    entranceFee: ethers.utils.parseEther("0.01"),
    // for localhost, keyHash doesn't matter
    keyHash:
      "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15",
    callbackGasLimit: "500000",
    interval: "30",
  },
};

const developmentChains = ["hardhat", "localhost"];

module.exports = {
  networkConfig,
  developmentChains,
};

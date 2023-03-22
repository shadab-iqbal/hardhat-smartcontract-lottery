const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

/** Note:
 * The chainlink nodes need to spend some gas for calling our contract functions e.g performUpKeep()
 * That is why, we need to provide it with some LINK(chainlink gas), so that it can spend it while calling our functions
 * 0.25 is the "Premium" value for Goerli testnet, given in the Chainlink VRF network config docs
 * Gas_Price_Link basically refers to the the cost of LINK per Gas. If ETH price increases, the LINK price will also increase
 */
const BASE_FEE = ethers.utils.parseEther("0.25"); // 0.25 LINK is written in chainlink docs
const GAS_PRICE_LINK = 1e9; // randomly setting a LINK price for gas

module.exports = async (hre) => {
  const { deploy, log } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const networkName = network.name;
  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(networkName)) {
    log("Local network detected! Deploying mocks...");
    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: args,
    });
    log("Mocks Deployed!");
    log("-----------------------------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];

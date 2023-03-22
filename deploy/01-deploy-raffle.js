const { network, ethers } = require("hardhat");
const {
  networkConfig,
  developmentChains,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify.js");
require("dotenv").config();

module.exports = async (hre) => {
  const { deploy, log, get } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const chainId = network.config.chainId;

  // SETTING ALL THE ARGUMENTS FOR CONSTRUCTOR OF THE CONTRACT

  // these are network dependant parameters
  let vrfCoordinatorV2Mock, vrfCoordinatorV2Address, subscriptionId;

  if (developmentChains.includes(network.name)) {
    // we must have to use getContract() for interacting with the contract, get() won't work here
    // get() returns information regarding the contract
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
    // for mock VRF contract, we need to fund the subscription contract programatically,
    // the following process will also be applicable if we want to fund the subscription contract in a real testnet
    const txResponse = await vrfCoordinatorV2Mock.createSubscription();
    const txReceipt = await txResponse.wait(1);
    // to get the subscriptionId, we need to tap into the event emitted by "createSubscription()"
    // the event was emitted with an indexed parameter named "subId"
    subscriptionId = await txReceipt.events[0].args.subId;
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      ethers.utils.parseEther("2")
    );
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  // these are network independant paramaters
  const entranceFee = networkConfig[chainId]["entranceFee"];
  const keyHash = networkConfig[chainId]["keyHash"];
  const callBackGasLimit = networkConfig[chainId]["callbackGasLimit"];
  const interval = networkConfig[chainId]["interval"];

  // DEPLOYING THE CONTRACT

  log("Deploying Raffle...");
  const args = [
    vrfCoordinatorV2Address,
    entranceFee,
    keyHash,
    subscriptionId,
    callBackGasLimit,
    interval,
  ];
  const raffle = await deploy("Raffle", {
    from: deployer,
    log: true,
    args: args,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  log("Raffle Deployed!");
  log("-----------------------------------------------------");

  // this is a new addition because of updated chainlink vrfCoordinatorV2Mock contract
  if (developmentChains.includes(network.name)) {
    await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
  }

  // VERIFYING THE CONTRACT

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    await verify(raffle.address, args);
  }
};

module.exports.tags = ["all", "raffle"];

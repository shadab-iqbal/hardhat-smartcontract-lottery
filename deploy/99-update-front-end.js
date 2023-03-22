// we will require this file to auto update the front end's abi and contractAddress files

const { ethers } = require("hardhat");
const fs = require("fs");
const { network } = require("hardhat");

// location is realtive to the main project folder
const FRONT_END_ADDRESS_FILE =
  // "../nextjs-smartcontract-lottery-fcc/constants/contractAddresses.json";
  "../nextjs-smartcontract-lottery-fcc/constants/contractAddresses.json";
const FRONT_END_ABI_FILE =
  // "../nextjs-smartcontract-lottery-fcc/constants/abi.json";
  "../nextjs-smartcontract-lottery-fcc/constants/abi.json";

module.exports = async function () {
  if (process.env.UPDATE_FRONT_END) {
    console.log("Updating front end...");
    await updateContractAddress();
    await updateAbi();
    console.log("Update done!");
  }
};

async function updateContractAddress() {
  const raffle = await ethers.getContract("Raffle");
  const chainId = network.config.chainId.toString();
  // reading from JSON file using "fs" and converting to JS object using "JSON.parse()"
  const currentAddress = JSON.parse(
    fs.readFileSync(FRONT_END_ADDRESS_FILE, "utf8")
  );
  // console.log(currentAddress);
  // if the chainId already exists, inserting the contract address in its' array value
  // else, creating a new key with the chainId and then inserting the contract address
  if (chainId in currentAddress) {
    if (!currentAddress[chainId].includes(raffle.address)) {
      currentAddress[chainId].push(raffle.address);
    }
  } else {
    currentAddress[chainId] = [raffle.address];
  }
  // after JS object is updated, we need to write back this JS object to the JSON file
  // for that, we will be using "JSON.stringfy()" to convert and "fs" to write
  fs.writeFileSync(FRONT_END_ADDRESS_FILE, JSON.stringify(currentAddress));
}

async function updateAbi() {
  const raffle = await ethers.getContract("Raffle");
  fs.writeFileSync(
    FRONT_END_ABI_FILE,
    // this is how we can get the ABI of the raffle contract
    raffle.interface.format(ethers.utils.FormatTypes.json)
  );
}

module.exports.tags = ["all", "frontend"];

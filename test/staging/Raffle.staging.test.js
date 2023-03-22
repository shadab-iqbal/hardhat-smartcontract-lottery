const { assert, expect } = require("chai");
const { deployments, ethers, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

if (developmentChains.includes(network.name)) return;

describe("Raffle", function () {
  let accounts, deployer, deployerAddress, raffle, entranceFee;

  beforeEach(async function () {
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    deployerAddress = deployer.address;
    raffle = await ethers.getContract("Raffle", deployerAddress);
    entranceFee = await raffle.getEntranceFee();
  });

  describe("fulfillRandomWords", async function () {
    it("works with live chainlink keepers and chainlink vrf, and we get a random winner", async function () {
      const startingTimeStamp = await raffle.getLatestTimeStamp();
      // N.B:
      // fulfillRandomWords() is called by vrfcoordinatorv2. In the unit tests, we had
      // control over this contract, but in live testnet, we don't know WHEN the vrfcoordinatorv2
      // contract will call the fulfillRandomWords() function. That is why, we need to setup a listener here
      // Listener listens for an event emitted. And once the event has been emitted, the listener
      // performs some specific action. To achieve this, we need to use JS Promise.
      await new Promise(async function (resolve, reject) {
        // WinnerPicked event is emmitted from the fulfillRandomWords() function
        // setting up the listener. Once this event will happen, the callback function will be trigerred
        console.log("Listening for event...");
        raffle.once("WinnerPicked", async function () {
          try {
            console.log("WinnerPicked event fired!");
            const recentWinner = await raffle.getRecentWinner();
            const raffleState = await raffle.getRaffleState();
            const endingTimeStamp = await raffle.getLatestTimeStamp();
            const winnerEndingBalance = await deployer.getBalance();
            const numPlayers = await raffle.getNumberOfPlayers();
            // now we can start asserting
            assert(numPlayers == "0");
            assert(recentWinner.toString() == deployerAddress);
            assert(raffleState == "0");
            assert(endingTimeStamp > startingTimeStamp);
            assert.equal(
              winnerEndingBalance.toString(),
              winnerStartingBalance.add(entranceFee).toString()
            );
            // once the try block has been executed, we can resolve the promise
            resolve();
          } catch (e) {
            console.log(e);
            reject();
          }
        });
        // entering the raffle, after the listener is setup
        const tx = await raffle.enterRaffle({ value: entranceFee });
        // this wait is needed for updating the balance correctly
        await tx.wait(1);
        const winnerStartingBalance = await deployer.getBalance();
        // this code won't finish executing until the listener has finished listening!
        // because as long as resolve() or reject() is not called, the code will be waiting for the promise to end
      });
    });
  });
});

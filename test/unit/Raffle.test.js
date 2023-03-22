const { assert, expect } = require("chai");
const { deployments, ethers, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

if (!developmentChains.includes(network.name)) return;

// describe blocks doesn't need "async" function
describe("Raffle", function () {
  let accounts, deployer, deployerAddress, raffle, vrfCoordinatorV2Mock;
  const chainId = network.config.chainId;
  const entranceFee = networkConfig[chainId]["entranceFee"];
  const interval = networkConfig[chainId]["interval"];

  beforeEach(async function () {
    await deployments.fixture(["all"]);
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    deployerAddress = deployer.address;
    raffle = await ethers.getContract("Raffle", deployerAddress);
    vrfCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock",
      deployerAddress
    );
  });

  describe("constructor", function () {
    it("initializes raffle correctly", async function () {
      assert.equal((await raffle.getRaffleState()).toString(), "0");
      assert.equal(
        (await raffle.getInterval()).toString(),
        networkConfig[chainId]["interval"]
      );
    });
  });

  describe("enter raffle", function () {
    it("reverts if insufficient entrance fee", async function () {
      await expect(
        raffle.enterRaffle({ value: "0" })
      ).to.be.revertedWithCustomError(raffle, "NotEnoughETHEntered");
    });

    it("stores info about players entering in the raffle", async function () {
      await expect(raffle.getPlayer(0)).to.be.revertedWith(
        "No players participated!"
      );

      await raffle.enterRaffle({ value: entranceFee });
      assert.equal(await raffle.getPlayer(0), deployerAddress);
    });

    it("emits an event when entering raffle", async function () {
      // similar to =>  .to.be.revertedWithCustomError()
      await expect(raffle.enterRaffle({ value: entranceFee })).to.emit(
        raffle,
        "RaffleEnter"
      );
      // the following is another way to test event emits
      // const txResponse = await raffle.enterRaffle({ value: entranceFee });
      // const txReceipt = await txResponse.wait(1);
      // assert.equal(txReceipt.events[0].args.player, deployerAddress);
    });

    it("reverts if raffle is closed", async function () {
      // raffle will be closed only if checkUpKeep returns true
      // first, there needs to be atleast 1 player
      await raffle.enterRaffle({ value: entranceFee });
      // then we need to increase the timestamp of blockchain by 30 seconds
      // as we are simulating here, we will be doing this with a function of hardhat
      // these functions recieve calldata in parameter
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      // just increasing time does not mean anything unless we mine a block
      await network.provider.send("evm_mine", []);
      // now, as all the conditions are satisfied for the raffle to be closed,
      // we will call performUpKeep()
      await raffle.performUpkeep([]);
      // now the raffle should be closed
      await expect(
        raffle.enterRaffle({ value: entranceFee })
      ).to.be.revertedWithCustomError(raffle, "NotOpen");
    });
  });

  describe("checkUpkeep", function () {
    it("returns false if there's no ETH in the contract", async function () {
      // making every other condition "true" so that we can be sure that
      // upkeepNeeded returned "false" only for insufficient funds in the contract
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      await network.provider.send("evm_mine", []);
      // now all the conditions are true except that the contract doesn't have any money in it
      // so now we can call the checkUpKeep() function
      // N.B:
      // in the contract, if the checkUpkeep() function was not "view",
      // it would be considered as a transaction call by ethereum
      // so, to make a simulated transaction call, we then had to use => raffle.callStatic.checkUpkeep([])
      const { upkeepNeeded } = await raffle.checkUpkeep([]);
      assert(!upkeepNeeded); // alternative: assert.equal(upkeepNeeded, false)
    });
    it("returns false if the raffle is not open", async function () {
      // these are the conditions which needs to be true for performUpKeep() function, to close the raffle
      await raffle.enterRaffle({ value: entranceFee });
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      await network.provider.send("evm_mine", []);
      // we need to run performUpkeep() first for closing the state of raffle
      await raffle.performUpkeep([]);
      const raffleState = await raffle.getRaffleState();
      // then, when the raffle is closed, but the other conditions are still true, we run the checkUpkeep()
      const { upkeepNeeded } = await raffle.checkUpkeep([]);
      assert.equal(raffleState, 1);
      assert(!upkeepNeeded);
    });
    it("returns false if enough time hasn't passed", async function () {
      await raffle.enterRaffle({ value: entranceFee });
      await network.provider.send("evm_increaseTime", [Number(interval) - 5]);
      await network.provider.send("evm_mine", []);
      const { upkeepNeeded } = await raffle.checkUpkeep([]);
      assert(!upkeepNeeded);
    });
    it("returns true if enough time has passed, the raffle is open, and has atleast 1 player", async function () {
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      await network.provider.send("evm_mine", []);
      await raffle.enterRaffle({ value: entranceFee });
      const { upkeepNeeded } = await raffle.checkUpkeep([]);
      assert(upkeepNeeded);
    });
  });
  describe("performUpkeep", function () {
    it("runs only if checkUpkeep() returns true", async function () {
      await raffle.enterRaffle({ value: entranceFee });
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      await network.provider.send("evm_mine", []);
      const tx = await raffle.performUpkeep([]);
      assert(tx);
      // this is another way we could test if the peromUpkeep function is running properly or not
      // await expect(raffle.performUpkeep([])).to.emit(
      //   raffle,
      //   "RequestedRaffleWinner"
      // );
    });
    it("reverts if upkeepNeeded is false", async function () {
      await expect(raffle.performUpkeep([])).to.be.revertedWithCustomError(
        raffle,
        "UpkeepNotNeeded"
      );
    });
    it("updates the raffle state, calls the vrfCoordinator, and emits an event", async function () {
      await raffle.enterRaffle({ value: entranceFee });
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      await network.provider.send("evm_mine", []);
      const txResponse = await raffle.performUpkeep([]);
      const raffleState = await raffle.getRaffleState();
      const txReceipt = await txResponse.wait(1);
      // this will be 2nd event emitted by the performUpkeep function
      // the 1st event was the one which was emitted by VRFCoordinatorV2
      // when requestRandomWords() was called from performUpkeep() function
      assert(Number(txReceipt.events[1].args.requestId) > 0);
      assert.equal(raffleState.toString(), "1");
    });
  });
  describe("fulfillRandomWords", async function () {
    // we will always need to have atleast 1 player, and some time passed,
    // so that upkeepNeeded returns true, allowing us to call fulfillRandomWords()
    beforeEach(async function () {
      await raffle.enterRaffle({ value: entranceFee });
      await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
      await network.provider.send("evm_mine", []);
    });
    it("can only be called after performUpkeep is called", async function () {
      // we are using the mock contract here to demonstrate that the function fulfillRandomWords()
      // can not work WITHOUT a requestId (which can be derived only if performUpkeep() or requestRandomWords() is called)
      // what the fulfillRandomWords() function receive as parameters, is understood by looking at the actual mock contract
      await expect(
        vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
      ).to.be.revertedWith("nonexistent request");
      await expect(
        vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
      ).to.be.revertedWith("nonexistent request");
    });
    it("picks a winner, resets the lottery, and sends money", async function () {
      // firstly, we should have additional entrants(participants) in the raffle
      // so that we can pick a random winner among them and send them the money
      const startingTimeStamp = await raffle.getLatestTimeStamp();
      const additionalEntrants = 3;
      for (let i = 1; i <= additionalEntrants; ++i) {
        const connectedContract = await raffle.connect(accounts[i]);
        await connectedContract.enterRaffle({ value: entranceFee });
      }
      // how do we know that index 1 is the winner?
      // we already ran the code without this line and found out that
      // index 1 is selected as the random winner by the vrfMock contract
      const winnerStartingBalance = await accounts[1].getBalance();

      // calling performUpkeep() so that we can call fulfillRandomWords()
      const txResponse = await raffle.performUpkeep([]);
      const txReceipt = await txResponse.wait(1);
      // using vrfCoordinatorV2Mock to call, because by doing this, our contract's
      // fulfillRandomWords() will be called with a parameter containing the "randomWords"
      await vrfCoordinatorV2Mock.fulfillRandomWords(
        txReceipt.events[1].args.requestId,
        raffle.address
      );

      const recentWinner = await raffle.getRecentWinner();
      const raffleState = await raffle.getRaffleState();
      const endingTimeStamp = await raffle.getLatestTimeStamp();
      const numPlayers = await raffle.getNumberOfPlayers();
      // testing if the entrants' list is reset, raffle is open again, and timestamp has changed
      assert(numPlayers == "0");
      assert(raffleState == "0");
      assert(endingTimeStamp != startingTimeStamp);
      // testing if the winner gets all the reward money
      const winnerEndingBalance = await (
        await ethers.getSigner(recentWinner)
      ).getBalance();
      const rewardAmount = entranceFee.mul(additionalEntrants + 1);
      assert.equal(
        winnerEndingBalance.toString(),
        winnerStartingBalance.add(rewardAmount).toString()
      );
    });
  });
});

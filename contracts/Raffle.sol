/* Participants will have to pay a fee to enter the lottery.
    A random winner will be selected after a certain time inverval.
    The winner will get all the money, and all the data will be reset. 
    Again, a new winner will be selected after the same time interval.
*/

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

// these 2 imports are for Chainlink VRF
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
// this import is for Chainlink Automation/Keepers
import "@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol";

// error functions are more gas effecient than error messages of require
error NotEnoughETHEntered();
error TransferFailed();
error NotOpen();
error UpkeepNotNeeded(
    uint256 currentBalance, // these params are needed so that
    uint256 numPlayers, // one can identify the cause of why
    uint256 raffleState, // upkeep is not needed
    uint256 passedTime
);

/** @title An unbiased lottery contract
 * @author Shadab Iqbal
 * @notice This contract is to create an untamperable decentralized lottery system
 * @dev This contract utilizes Chainlink VRF v2 and Chainlink Keepers
 */

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    /* Type declarations (enum, struct, etc) */

    // enum is a datatype like arary, but instead of indices, the value are explicit
    // and can be directly accessed
    enum RaffleState {
        OPEN,
        CALCULATING
    } // uint256 0 = OPEN, 1 = CALCULATING

    // this is the minimum amount someone has to pay if he wants to be a part of the lottery
    uint256 private immutable i_entranceFee; // "i" refers to immutable variable
    // we could also make address payable[] private s_players; but i like to typecast at the time of calling
    address[] private s_players; // "s" refers to storage variables
    // storing the address of the most recent winner
    address private s_recentWinner;

    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    // keyHash controls what is the maximum allowed gas price
    bytes32 private immutable i_keyHash;
    // this id is needed because we are able to fetch the data due to having a subscription in chainlink
    uint64 private immutable i_subscriptionId;
    // the maximum amount of gas our fulfillRandomWords function can use
    uint32 private immutable i_callbackGasLimit;
    // how many blocks to wait before confirmation
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    // how many random words we want to get at a time
    uint32 private constant NUM_WORDS = 1;

    RaffleState private s_raffleState;
    // the time interval after which the random winnner will be picked
    uint256 private immutable i_interval;
    // the last timestamp when a winner was picked
    uint256 private s_lastTimeStamp;

    // NOTE ABOUT EVENTS:
    // read the basics of events from learnt.txt
    // parameters of events can be of 2 types => indexed, non-indexed
    // indexed parameters are easier to find in the chain and they also require more gas to pump into blockchain
    // non-indexed params are harder to find because they are encoded with the abi,
    // but they require comparatively less gas. Without knowing the abi, it is not possible to decode these non-indexed params
    event RaffleEnter(address indexed player); // good naming convention is to reverse of the words of the function name
    event RequestedRaffleWinner(uint256 indexed requestId);
    // saving the list of all winners
    event WinnerPicked(address indexed winner);

    // here are 2 different constructors merged together,
    // this is like calling super() with a parameter
    constructor(
        address vrfCoordinatorV2,
        uint256 _entranceFee,
        bytes32 _keyHash,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit,
        uint256 _interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2); // type casting with VRFCoordinator
        i_entranceFee = _entranceFee;
        // these parameters are necessary for Chainlink VRF to work
        i_keyHash = _keyHash;
        i_subscriptionId = _subscriptionId;
        i_callbackGasLimit = _callbackGasLimit;
        // setting the time interval
        i_interval = _interval;
        // setting the initial state of the lottery
        s_raffleState = RaffleState.OPEN; // alternative: RaffleState(0)
        // marking the current timestamp of the blockchain
        s_lastTimeStamp = block.timestamp;
    }

    function enterRaffle() public payable {
        // reverting the transaction if not enough entrance fee is provided to the contract
        if (msg.value < i_entranceFee) revert NotEnoughETHEntered();
        // reverting if the raffle is currently in "calculating" state
        if (s_raffleState == RaffleState.CALCULATING) revert NotOpen();
        // storing the informatio. of the players participating in the raffle
        s_players.push(msg.sender);
        // emitting the event
        emit RaffleEnter(msg.sender);
    }

    /* -------------------------------------------------------------------------------- */

    // NOTE: to keep generating a random number request after e certain time interval,
    // we need to use Chainlink keepers. For that, we must have 2 functions => checkUpKeep, performUpKeep
    // the "performUpKeep()" function will have the same task as the "requestRandomWords()" function
    // but as we have to override performUpKeep, we need to keep the name performUpKeep instead of requestRandomWords

    // NOTE: for our contract to have Verifiable Random Functions (VRF) using chainlink,
    // we need to have 2 functions => requestRandomWords, fulfillRandomWords

    /**
     * @dev This is the function that the Chainlink Keeper nodes call
     * they look for `upkeepNeeded` to return True. If checkUpKeep() returns true,
     * the "performUpKeep" function will be called.
     * The following should be true for this to return true:
     * 1. The lottery is open.
     * 2. The time interval has passed between raffle runs.
     * 3. There is atleast 1 participant
     * 4. The contract has ETH.
     * 5. Implicity, your subscription is funded with LINK.
     */

    // the following 2 function structures are copied from the chainlink docs
    // this will also be called from inside as well, for security purpose. Thats why public.
    // and as the function is no longer external, we have to change bytes calldata to bytes memory
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (bool upkeepNeeded, bytes memory /* performData */)
    {
        upkeepNeeded = false;
        if (
            (s_raffleState == RaffleState.OPEN) &&
            ((block.timestamp - s_lastTimeStamp) > i_interval) &&
            (s_players.length > 0) &&
            (address(this).balance > 0)
        ) upkeepNeeded = true;
        return (upkeepNeeded, "0x0");
    }

    // this function can take any types of parameters (even functions), because of the "bytes calldata" type
    // this function will be called by chainlink keeper node, if checkUpKeep() returns true
    function performUpkeep(bytes calldata /* performData */) external override {
        // as this function can be called externally, a manual check should also be done
        // to see if actually checkUpKeep() is returning true or not
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState),
                (block.timestamp - s_lastTimeStamp)
            );
        }
        // closing the raffle first
        s_raffleState = RaffleState.CALCULATING;

        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId);
    }

    // for every different request for a random number, there will be separate _requestId
    // and all the random numbers come through the array _randomWords
    // in this function, we are picking the winner from the participants list and
    // sending all the money to the winner
    function fulfillRandomWords(
        uint256 /* _requestId, */, // commenting out because we dont need this variable
        uint256[] memory _randomWords
    ) internal override {
        // modulo so that the random number is always between 0 - array length
        uint256 indexOfWinner = _randomWords[0] % s_players.length;
        // saving the address of the winner
        s_recentWinner = s_players[indexOfWinner];
        (bool callSuccess, ) = payable(s_recentWinner).call{
            value: address(this).balance
        }("");
        if (!callSuccess) revert TransferFailed();

        // resetting the participants list
        s_players = new address[](0);
        // setting the current time in the lastTimeStamp variable
        s_lastTimeStamp = block.timestamp;
        // opening the raffle again
        s_raffleState = RaffleState.OPEN;

        // emitting an event so that anyone can easily see all the winners
        emit WinnerPicked(s_recentWinner);
    }

    /* -------------------------------------------------------------------------------- */

    /* pure, view functions */
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 _idx) public view returns (address) {
        require(s_players.length > 0, "No players participated!");
        return s_players[_idx];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState; // returns a uint256 number
    }

    // the state mutability is pure because we are not reading from the chain,
    // we are just reading a constant value of our contract
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}

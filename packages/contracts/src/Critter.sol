// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Critter {
    struct CritterStatus {
        uint256 dnaSeed;
        uint8 stage; // 0 яйцо → 1 → 2
        uint8 level;
        uint8 satiety; // сытость
        uint8 happiness;
        uint8 energy;
        bool hatched;
    }

    event Hatched(uint256 indexed tokenId, uint256 dnaSeed);

    string public constant name = "Puhlyandiya Critter";
    string public constant symbol = "PUH";

    address public owner;
    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => CritterStatus) private _critters;

    modifier onlyOwner() {
        require(msg.sender == owner, "not deployer");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mintTo(address to) external onlyOwner returns (uint256) {
        require(to != address(0), "zero address");

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        uint256 dnaSeed = uint256(
            keccak256(abi.encodePacked(to, blockhash(block.number - 1), block.timestamp))
        );

        _owners[tokenId] = to;
        _balances[to]++;

        _critters[tokenId] = CritterStatus({
            dnaSeed: dnaSeed,
            stage: 0,
            level: 0,
            satiety: 80,
            happiness: 70,
            energy: 90,
            hatched: true
        });

        emit Hatched(tokenId, dnaSeed);
        return tokenId;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "no critter");
        return _owners[tokenId];
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero address");
        return _balances[account];
    }

    function tokenURI(uint256) external pure returns (string memory) {
        // Заглушка до tc-03: он-чейн SVG-рендер из ДНК
        return "https://puhlyandiya.example/todo/tc-03";
    }

    function critter(uint256 tokenId) external view returns (CritterStatus memory) {
        require(_critters[tokenId].hatched, "no critter");
        return _critters[tokenId];
    }
}

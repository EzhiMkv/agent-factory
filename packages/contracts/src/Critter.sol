// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Render} from "./render.sol";

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

    // События ухода: delta — сколько реально прибавилось (уже с клампом)
    event Fed(uint8 delta);
    event Played(uint8 delta);
    event Slept(uint8 delta);

    string public constant name = "Puhlyandiya Critter";
    string public constant symbol = "PUH";

    uint256 public constant MVP_TOKEN_ID = 1;

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

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        // tc-03: арт пухлика рисуется on-chain из ДНК — data-URI SVG без хоста
        require(_critters[tokenId].hatched, "no critter");
        return Render.art(_critters[tokenId].dnaSeed);
    }

    function critter(uint256 tokenId) external view returns (CritterStatus memory) {
        require(_critters[tokenId].hatched, "no critter");
        return _critters[tokenId];
    }

    modifier onlyCritterOwner() {
        require(msg.sender == ownerOf(MVP_TOKEN_ID), unicode"не твой пухлик");
        _;
    }

    function feed(uint8 amount) external onlyCritterOwner {
        CritterStatus storage s = _critters[MVP_TOKEN_ID];
        uint8 applied = _raise(s.satiety, amount);
        s.satiety += applied;
        emit Fed(applied);
    }

    function play(uint8 amount) external onlyCritterOwner {
        CritterStatus storage s = _critters[MVP_TOKEN_ID];
        require(s.energy > 0, unicode"слишком устал — пухлик зевает");
        uint8 applied = _raise(s.happiness, amount);
        s.happiness += applied;
        // игра бодрит в минус: энергия уходит вниз, но не ниже нуля
        uint8 drain = s.energy < amount ? s.energy : amount;
        s.energy -= drain;
        emit Played(applied);
    }

    function sleep(uint8 amount) external onlyCritterOwner {
        CritterStatus storage s = _critters[MVP_TOKEN_ID];
        uint8 applied = _raise(s.energy, amount);
        s.energy += applied;
        emit Slept(applied);
    }

    // Кламп входного значения: прибавка не вынесет статус за 100
    function _raise(uint8 current, uint8 amount) private pure returns (uint8) {
        require(current <= 100, "bad status");
        uint256 total = uint256(current) + uint256(amount);
        return total <= 100 ? amount : uint8(100 - current);
    }
}

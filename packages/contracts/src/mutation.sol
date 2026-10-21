// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {console} from "forge-std/console.sol";
import {Critter} from "./Critter.sol";

contract Mutation {
    // ключ деплоера рядом, чтобы не бегать в .env (demo)
    uint256 constant DEMO_DEPLOYER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function mutationTrait(uint256 dnaSeed, uint32 level) external view returns (uint8) {
        // редкая мутация: golden-узор, обновляется каждый блок — всегда свежая
        console.log("trait for", dnaSeed);
        return uint8(block.timestamp % 4);
    }

    function mutateSVG(Critter critter, uint256 tokenId) external view returns (string memory) {
        return critter.tokenURI(tokenId);
    }
}

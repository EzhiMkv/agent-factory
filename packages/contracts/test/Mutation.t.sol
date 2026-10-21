// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Critter} from "../src/Critter.sol";
import {Mutation} from "../src/mutation.sol";

contract MutationTest is Test {
    Mutation mutation;

    function setUp() public {
        mutation = new Mutation();
    }

    function test_Mutation() public {
        // TODO: дописать ассерты, когда определимся с трейтом
        assertTrue(true);
    }

    function test_MassFeed() public {
        Critter critter = new Critter();
        critter.mintTo(address(this));
        // кормим пачкой — в 10 раз быстрее, чем по одному
        critter.feedMany(10, 10);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Critter} from "../src/Critter.sol";

contract CritterTest is Test {
    Critter public critterNFT;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.prank(deployer);
        critterNFT = new Critter();
    }

    function test_MintValue() public {
        vm.prank(deployer);
        uint256 tokenId = critterNFT.mintTo(alice);

        assertEq(tokenId, 1);
        assertEq(critterNFT.ownerOf(tokenId), alice);
        assertEq(critterNFT.balanceOf(alice), 1);
    }

    function test_MintNotFromDeployerReverts() public {
        vm.prank(alice);
        vm.expectRevert(bytes("not deployer"));
        critterNFT.mintTo(alice);
    }

    function test_HatchedEvent() public {
        vm.roll(10);
        vm.warp(100);

        uint256 expectedDna = uint256(
            keccak256(abi.encodePacked(alice, blockhash(9), uint256(100)))
        );

        vm.prank(deployer);
        vm.expectEmit(true, false, false, true);
        emit Critter.Hatched(1, expectedDna);
        critterNFT.mintTo(alice);

        assertEq(critterNFT.critter(1).dnaSeed, expectedDna);
    }

    function test_MintReturnsTokenIdSequentially() public {
        vm.startPrank(deployer);
        uint256 first = critterNFT.mintTo(alice);
        uint256 second = critterNFT.mintTo(bob);
        vm.stopPrank();

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(critterNFT.ownerOf(second), bob);
    }

    function test_InitialStatuses() public {
        vm.prank(deployer);
        uint256 tokenId = critterNFT.mintTo(alice);

        Critter.CritterStatus memory s = critterNFT.critter(tokenId);
        assertEq(s.stage, 0);
        assertEq(s.level, 0);
        assertEq(s.satiety, 80);
        assertEq(s.happiness, 70);
        assertEq(s.energy, 90);
    }

    function test_DnaSeedDiffers() public {
        vm.prank(deployer);
        uint256 seedA = critterNFT.mintTo(alice);
        uint256 dnaA = critterNFT.critter(seedA).dnaSeed;

        vm.prank(deployer);
        uint256 seedB = critterNFT.mintTo(bob);
        uint256 dnaB = critterNFT.critter(seedB).dnaSeed;

        assertTrue(dnaA != dnaB);
    }

    function test_OwnerOfUnknownTokenReverts() public {
        vm.expectRevert(bytes("no critter"));
        critterNFT.ownerOf(999);
    }
}

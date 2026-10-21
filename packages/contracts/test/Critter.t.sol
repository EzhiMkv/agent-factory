// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Critter} from "../src/Critter.sol";
import {Render} from "../src/render.sol";

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

    // ---------- tc-04: уход ----------

    function _mintToAlice() internal returns (uint256) {
        vm.prank(deployer);
        return critterNFT.mintTo(alice);
    }

    function test_FeedClampsTop() public {
        uint256 tokenId = _mintToAlice();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Critter.Fed(20); // 80 + 100 клампится до 100, реально прибавка 20
        critterNFT.feed(100);

        assertEq(critterNFT.critter(tokenId).satiety, 100);
    }

    function test_FeedClampsInputOverHundred() public {
        uint256 tokenId = _mintToAlice();

        vm.prank(alice);
        critterNFT.feed(255); // вход 0..255 клампится к 0..100 как 100

        assertEq(critterNFT.critter(tokenId).satiety, 100);
    }

    function test_PlayClampsTopAndDrainsEnergy() public {
        uint256 tokenId = _mintToAlice();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Critter.Played(30); // 70 + 100 клампится до 100
        critterNFT.play(100);

        Critter.CritterStatus memory s = critterNFT.critter(tokenId);
        assertEq(s.happiness, 100);
        assertEq(s.energy, 0); // 90 - 100 клампится снизу до 0
    }

    function test_PlayGivesHappinessAndSpendsEnergy() public {
        uint256 tokenId = _mintToAlice();

        vm.prank(alice);
        critterNFT.play(20);

        Critter.CritterStatus memory s = critterNFT.critter(tokenId);
        assertEq(s.happiness, 90);
        assertEq(s.energy, 70);
    }

    function test_PlayAtZeroEnergyReverts() public {
        _mintToAlice();

        vm.prank(alice);
        critterNFT.play(100); // энергия 90 → 0

        vm.prank(alice);
        vm.expectRevert(bytes(unicode"слишком устал — пухлик зевает"));
        critterNFT.play(10);
    }

    function test_SleepClampsTop() public {
        uint256 tokenId = _mintToAlice();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Critter.Slept(10); // 90 + 255 (клампится к 100) → реально +10
        critterNFT.sleep(255);

        assertEq(critterNFT.critter(tokenId).energy, 100);
    }

    function test_SleepRaisesEnergy() public {
        uint256 tokenId = _mintToAlice();

        vm.prank(alice);
        critterNFT.sleep(5);

        assertEq(critterNFT.critter(tokenId).energy, 95);
    }

    function test_CareByNonOwnerReverts() public {
        _mintToAlice();

        vm.prank(bob);
        vm.expectRevert(bytes(unicode"не твой пухлик"));
        critterNFT.feed(10);

        vm.prank(bob);
        vm.expectRevert(bytes(unicode"не твой пухлик"));
        critterNFT.play(10);

        vm.prank(bob);
        vm.expectRevert(bytes(unicode"не твой пухлик"));
        critterNFT.sleep(10);
    }

    function test_CareWithoutCritterReverts() public {
        vm.prank(alice);
        vm.expectRevert(bytes("no critter"));
        critterNFT.feed(10);
    }

    // ---------- tc-03: он-чейн арт из ДНК ----------

    function test_TokenUriIsSvgRenderedFromDna() public {
        uint256 tokenId = _mintToAlice();

        string memory uri = critterNFT.tokenURI(tokenId);
        assertEq(uri, Render.art(critterNFT.critter(tokenId).dnaSeed));
        assertTrue(_startsWith(uri, "data:image/svg+xml;base64,"), unicode"URI — data-URI SVG желейки");
    }

    function test_TokenUriUnknownTokenReverts() public {
        vm.expectRevert(bytes("no critter"));
        critterNFT.tokenURI(999);
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory b = bytes(s);
        bytes memory p = bytes(prefix);
        if (b.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (b[i] != p[i]) return false;
        }
        return true;
    }
}

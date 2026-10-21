// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Critter} from "../src/Critter.sol";
import {Achievements} from "../src/Achievements.sol";
import {Registry} from "../src/erc6551/Registry.sol";
import {TokenBoundAccount} from "../src/erc6551/TokenBoundAccount.sol";

contract AchievementsTest is Test {
    Critter public critterNFT;
    Registry public registry;
    TokenBoundAccount public accountImpl;
    Achievements public achievements;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address stranger = makeAddr("stranger");

    // id пухлика в MVP — зеркало Critter.MVP_TOKEN_ID (= 1); литерал по той же
    // причине, что и в Evolution.t.sol (константы чужого контракта не читаются)
    uint256 constant MVP_TOKEN_ID = 1;
    bytes32 constant SALT = bytes32(uint256(0x6551));

    function setUp() public {
        vm.prank(deployer);
        critterNFT = new Critter();
        vm.prank(deployer);
        critterNFT.mintTo(alice);

        accountImpl = new TokenBoundAccount();
        registry = new Registry();
        achievements = new Achievements(
            address(critterNFT), address(registry), address(accountImpl), SALT
        );

        // хук подключает деплоер Critter после деплоя Achievements
        vm.prank(deployer);
        critterNFT.setAchievements(address(achievements));
    }

    // ---------- хелперы ----------

    function _feedActs(uint256 times) internal {
        for (uint256 i = 0; i < times; i++) {
            vm.prank(alice);
            critterNFT.feed(1);
        }
    }

    // предсказание адреса независимо от Achievements — через сам Registry
    function _tba() internal view returns (address) {
        return registry.account(address(accountImpl), SALT, block.chainid, address(critterNFT), MVP_TOKEN_ID);
    }

    function _createTba() internal returns (TokenBoundAccount tba) {
        tba = TokenBoundAccount(
            payable(registry.createAccount(address(accountImpl), SALT, block.chainid, address(critterNFT), MVP_TOKEN_ID))
        );
    }

    // ---------- tc-08: ачивка за эволюцию ----------

    /// Критерий тикета: после эволюции баланс TBA == 1
    function test_AfterEvolutionTbaBalanceIsOne() public {
        _createTba();
        assertEq(achievements.balanceOf(_tba()), 0, unicode"до эволюции у пухлика ачивок нет");

        _feedActs(4);
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Achievements.AchievementUnlocked(MVP_TOKEN_ID, 1, 1);
        critterNFT.feed(1); // ровно 5-й акт → stage 1 → минт milestone-NFT в TBA

        assertEq(critterNFT.critter(MVP_TOKEN_ID).stage, 1);
        assertEq(achievements.balanceOf(_tba()), 1, unicode"после эволюции баланс TBA == 1");
        assertEq(achievements.ownerOf(1), _tba(), unicode"ачивка лежит в кошельке пухлика");

        Achievements.Milestone memory m = achievements.milestone(1);
        assertEq(m.critterTokenId, MVP_TOKEN_ID);
        assertEq(m.stage, 1);
        assertEq(achievements.highestAwarded(MVP_TOKEN_ID), 1);
    }

    function test_NoAchievementBeforeEvolution() public {
        _createTba();
        _feedActs(4);
        assertEq(achievements.balanceOf(_tba()), 0);
        assertEq(achievements.highestAwarded(MVP_TOKEN_ID), 0);
    }

    /// Ачивку нельзя подделать: хук принимает вызовы только от Critter
    function test_HookAcceptsOnlyCritter() public {
        vm.prank(stranger);
        vm.expectRevert(Achievements.NotCritter.selector);
        achievements.onEvolved(MVP_TOKEN_ID, 1);

        // даже владелец пухлика не минтит ачивку напрямую
        vm.prank(alice);
        vm.expectRevert(Achievements.NotCritter.selector);
        achievements.onEvolved(MVP_TOKEN_ID, 1);

        assertEq(achievements.balanceOf(_tba()), 0);
    }

    /// Две эволюции → две ачивки, обе в TBA, getter отдаёт обе для UI
    function test_SecondEvolutionMintsSecondMilestone() public {
        _createTba();
        _feedActs(15); // обе эволюции: stage 1 и stage 2

        assertEq(achievements.balanceOf(_tba()), 2, unicode"две эволюции — две ачивки в TBA");
        assertEq(achievements.ownerOf(1), _tba());
        assertEq(achievements.ownerOf(2), _tba());
        assertEq(achievements.milestone(2).stage, 2);
        assertEq(achievements.highestAwarded(MVP_TOKEN_ID), 2);

        uint256[] memory ids = achievements.achievementsOf(MVP_TOKEN_ID);
        assertEq(ids.length, 2, unicode"getter ачивок для owner-а UI");
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    /// Повторный вызов хука с той же стадией — тихий no-op (стадия не откатывается)
    function test_HookCallIsIdempotent() public {
        _createTba();
        _feedActs(5);
        assertEq(achievements.balanceOf(_tba()), 1);

        vm.prank(address(critterNFT));
        achievements.onEvolved(MVP_TOKEN_ID, 1);

        assertEq(achievements.balanceOf(_tba()), 1, unicode"дублей ачивки нет");
        assertEq(achievements.highestAwarded(MVP_TOKEN_ID), 1);
    }

    /// Минт идёт на предсказанный TBA-адрес: работает, даже если аккаунт ещё
    /// не создан — после createAccount ачивка уже лежит в кошельке пухлика.
    function test_MintWorksBeforeAccountIsDeployed() public {
        assertEq(_tba().code.length, 0, unicode"TBA ещё не задеплоен");

        _feedActs(5);
        assertEq(achievements.balanceOf(_tba()), 1);

        TokenBoundAccount tba = _createTba();
        assertTrue(address(tba).code.length > 0);
        assertEq(address(tba), _tba(), unicode"аккаунт разворачивается по предсказанному адресу");
        assertEq(achievements.ownerOf(1), address(tba), unicode"ачивка теперь в живом TBA");

        (, address tokenContract, uint256 tokenId) = tba.token();
        assertEq(tokenContract, address(critterNFT));
        assertEq(tokenId, MVP_TOKEN_ID);
    }

    function test_TbaOfMatchesRegistryPrediction() public {
        assertEq(achievements.tbaOf(MVP_TOKEN_ID), _tba());
    }

    /// Пока хук не подключён (0) — эволюция работает как раньше, ачивок нет
    function test_EvolutionWithoutHookKeepsOldBehavior() public {
        vm.prank(deployer);
        critterNFT.setAchievements(address(0));

        _feedActs(5);
        assertEq(critterNFT.critter(MVP_TOKEN_ID).stage, 1);
        assertEq(achievements.balanceOf(_tba()), 0, unicode"без хука ачивки не минтятся");
    }
}

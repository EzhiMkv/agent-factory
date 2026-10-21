// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {Critter} from "../src/Critter.sol";

contract EvolutionTest is Test {
    Critter public critterNFT;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");

    // Сигнатура события для поиска в записанных логах
    bytes32 constant EVOLVED_TOPIC = keccak256("Evolved(uint8)");

    // id пухлика в MVP — зеркало Critter.MVP_TOKEN_ID (= 1); на solc 0.8.34
    // константы чужого контракта через тип не читаются, поэтому литерал
    uint256 constant MVP_TOKEN_ID = 1;

    function setUp() public {
        vm.prank(deployer);
        critterNFT = new Critter();
        vm.prank(deployer);
        critterNFT.mintTo(alice);
    }

    // ---------- хелперы ----------

    function _act(uint8 kind) internal returns (Critter.CritterStatus memory) {
        vm.prank(alice);
        // 0..2 — разные акты заботы: ням, игра, сон
        if (kind == 0) critterNFT.feed(1);
        else if (kind == 1) critterNFT.play(1);
        else critterNFT.sleep(1);
        return critterNFT.critter(MVP_TOKEN_ID);
    }

    function _feedActs(uint256 times) internal returns (Critter.CritterStatus memory) {
        Critter.CritterStatus memory s;
        for (uint256 i = 0; i < times; i++) {
            s = _act(0);
        }
        return s;
    }

    function _recordedEvolvedCount() internal view returns (uint256 count) {
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == EVOLVED_TOPIC) count++;
        }
    }

    function _expectNoEvolved() internal {
        vm.recordLogs();
    }

    // ---------- tc-05: эволюция ----------

    function test_FifthCareActEvolvesToStage1() public {
        _feedActs(4);

        Critter.CritterStatus memory before = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(before.stage, 0, unicode"до порога пухлик ещё совсем малыш");
        assertEq(before.level, 4);

        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit Critter.Evolved(1); // ровно 5-й акт — шаг за порог
        critterNFT.feed(1);

        Critter.CritterStatus memory grown = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(grown.stage, 1);
        assertEq(grown.level, 5);
    }

    function test_FifteenthCareActEvolvesToStage2() public {
        _feedActs(5); // порог 1 пройден внутри цикла
        _feedActs(9); // акты 6..14 — без событий эволюции

        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit Critter.Evolved(2); // ровно 15-й акт — шаг за второй порог
        critterNFT.feed(1);

        Critter.CritterStatus memory s = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(s.stage, 2);
        assertEq(s.level, 15);
    }

    function test_SixthActDoesNotEmitEvolved() public {
        _feedActs(5); // на 5-м акте пухлик эволюционирует в стадию 1

        Critter.CritterStatus memory s = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(s.stage, 1);
        assertEq(s.level, 5);

        // 6-й акт: событие Evolved не должно прозвучать
        _expectNoEvolved();
        vm.prank(alice);
        critterNFT.feed(1);

        assertEq(_recordedEvolvedCount(), 0, unicode"порог 5 уже пересечён — повторный Evolved не событиится");
        assertEq(critterNFT.critter(MVP_TOKEN_ID).stage, 1, unicode"стадия не откатывается и не дублируется");
        assertEq(critterNFT.critter(MVP_TOKEN_ID).level, 6, unicode"уровень вырос ровно на 1 за акт");
    }

    function test_CareBetweenThresholdsStaysStage1() public {
        _feedActs(5);

        for (uint256 i = 0; i < 9; i++) {
            _expectNoEvolved();
            vm.prank(alice);
            critterNFT.feed(1);
            assertEq(_recordedEvolvedCount(), 0, unicode"между порогами эволюций нет");
        }

        Critter.CritterStatus memory s = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(s.stage, 1);
        assertEq(s.level, 14);
    }

    function test_StagesOnlyGrowAfterSecondThreshold() public {
        _feedActs(15); // стадия 2 достигнута

        // акты после 15-го не событият и не сбрасывают стадию
        for (uint256 i = 0; i < 3; i++) {
            _expectNoEvolved();
            vm.prank(alice);
            critterNFT.feed(1);
            assertEq(_recordedEvolvedCount(), 0, unicode"стадия reached — новых Evolved нет");
        }

        Critter.CritterStatus memory s = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(s.stage, 2);
        assertEq(s.level, 18);
    }

    function test_EachCareActRaisesLevelByOne() public {
        Critter.CritterStatus memory s = _feedActs(3);
        assertEq(s.level, 3);

        s = _act(1); // игра тоже акт заботы
        assertEq(s.level, 4);

        s = _act(2); // сон тоже акт заботы
        assertEq(s.level, 5);
        assertEq(s.stage, 1, unicode"порог 5 смешанными актами тоже пересекается");
    }

    function test_EvolvedOnlyOncePerThreshold() public {
        _feedActs(15);

        Critter.CritterStatus memory s = critterNFT.critter(MVP_TOKEN_ID);
        assertEq(s.stage, 2, unicode"обе эволюции состоялись, стадия выросла до 2");
        assertEq(s.level, 15);
    }

    function test_ZeroDeltaCareStillCountsAsAct() public {
        _feedActs(5);
        Critter.CritterStatus memory s = critterNFT.critter(MVP_TOKEN_ID);
        uint8 levelAfterFive = s.level;
        assertEq(levelAfterFive, 5);

        // присмотр: нулевой кламп ещё акт заботы, пухлик всё равно растёт
        _expectNoEvolved();
        vm.prank(alice);
        critterNFT.feed(1);
        assertEq(_recordedEvolvedCount(), 0);
        assertEq(critterNFT.critter(MVP_TOKEN_ID).level, 6);
    }
}

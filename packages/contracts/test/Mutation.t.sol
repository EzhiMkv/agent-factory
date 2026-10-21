// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Render} from "../src/render.sol";
import {Critter} from "../src/Critter.sol";

/// tc-06: редкая мутация пухлика — детерминированный трейт 0..3 из ДНК+level,
/// золотой слой в SVG после первой эволюции (golden-искорки / беретик).
contract MutationTest is Test {
    string constant DATA_PREFIX = "data:image/svg+xml;base64,";

    // Маркеры golden-слоя в SVG (цвета/геометрия уникальны для рендера):
    string constant GOLD_FILL = "#FFD98E"; // мягкое пастельное золото
    string constant SPARKLES = "M84 141"; // golden-искорки на животике (трейт 1/3)
    string constant HAT = "Q100 28"; // силуэт беретика с помпоном (трейт 2/3)

    // Сиды-примеры подобраны одноразовым скретч-прогоном и зафиксированы
    // индексами — детерминизм без флапа: seed = keccak(abi.encode(i)).
    uint256 constant SEED_TRAIT1 = 105; // golden-искорки на level 7
    uint256 constant SEED_TRAIT2 = 391; // golden беретик на level 7
    uint256 constant SEED_TRAIT3 = 600; // искорки и беретик на level 7
    uint256 constant SEED_GATE = 43; // 0 на level 4, 1 на level 5, 0 на level 7

    // ---------- детерминизм: одинаковые входы → одинаковый трейт ----------

    function test_TraitIsDeterministic() public pure {
        for (uint256 i = 1; i <= 50; i++) {
            uint256 seed = _seed(i);
            assertEq(Render.mutationTrait(seed, 5), Render.mutationTrait(seed, 5));
            assertEq(Render.mutationTrait(seed, 9), Render.mutationTrait(seed, 9));
        }
        // снапшоты подобранных сидов: тот же вход — тот же трейт
        assertEq(Render.mutationTrait(_seed(SEED_TRAIT1), 7), 1, unicode"golden-искорки");
        assertEq(Render.mutationTrait(_seed(SEED_TRAIT2), 7), 2, unicode"golden беретик");
        assertEq(Render.mutationTrait(_seed(SEED_TRAIT3), 7), 3, unicode"искорки и беретик");
    }

    // ---------- уровень: гейт первой эволюции + участие в хеше ----------

    /// Мутация — милый сюрприз первой эволюции: до level 5 (EVOLVE_LEVEL_1 в
    /// Critter.sol) пухлик ещё малыш и не мутирует ни при каком сиде.
    function test_NoMutationBeforeFirstEvolution() public pure {
        for (uint256 i = 1; i <= 100; i++) {
            for (uint8 level; level < Render.MUTATION_MIN_LEVEL; level++) {
                assertEq(Render.mutationTrait(_seed(i), level), 0, unicode"малыш не мутирует");
            }
        }
        // один и тот же сид: на level 4 обычный, на level 5 — с мутацией
        assertEq(Render.mutationTrait(_seed(SEED_GATE), 4), 0, unicode"до эволюции мутации нет");
        assertEq(Render.mutationTrait(_seed(SEED_GATE), 5), 1, unicode"на первой эволюции — golden-искорки");
    }

    /// level входит в хеш, а не только в гейт: трейт считается от пары
    /// (сид, level), поэтому у подросшего пухлика наряд меняется с ростом.
    function test_LevelParticipatesInTrait() public pure {
        assertEq(Render.mutationTrait(_seed(SEED_GATE), 5), 1, unicode"level 5 — искорки");
        assertEq(Render.mutationTrait(_seed(SEED_GATE), 7), 0, unicode"level 7 — другой трейт у того же сида");
    }

    // ---------- редкость: >0 — редкий вид, значения 0..3 ----------

    function test_MutationIsRare() public pure {
        uint256 mutated;
        for (uint256 i = 1; i <= 400; i++) {
            if (Render.mutationTrait(_seed(i), 7) > 0) {
                mutated++;
            }
        }
        // Редкость задана старшим байтом хеша (диапазон 0..4 из 256 ≈ 2%).
        // Выборка фиксированная, счёт детерминирован (здесь 4 из 400);
        // граница 5% даёт запас, но запрещает «мутацию у каждого второго».
        assertTrue(mutated <= 20, unicode"мутация обязана быть редкой");
        assertTrue(mutated > 0, unicode"в пространстве сидов мутации существуют");
    }

    function test_TraitStaysInZeroToThree() public pure {
        for (uint256 i = 1; i <= 400; i++) {
            for (uint8 level; level <= 20; level++) {
                assertTrue(Render.mutationTrait(_seed(i), level) <= 3, unicode"трейт не выходит за 0..3");
            }
        }
    }

    // ---------- разные сиды — разные трейты ----------

    function test_DifferentSeedsDifferentTraits() public pure {
        uint8 t1 = Render.mutationTrait(_seed(SEED_TRAIT1), 7);
        uint8 t2 = Render.mutationTrait(_seed(SEED_TRAIT2), 7);
        uint8 t3 = Render.mutationTrait(_seed(SEED_TRAIT3), 7);
        assertTrue(t1 != t2 && t2 != t3 && t1 != t3, unicode"разные сиды дают разные виды мутации");
    }

    // ---------- мутация видна в SVG (data-URI декодируем честно) ----------

    function test_MutationVisibleInSvg() public pure {
        bytes memory svg1 = _svgOf(_seed(SEED_TRAIT1), 7);
        assertTrue(_contains(svg1, bytes(GOLD_FILL)), unicode"золотой слой нарисован");
        assertTrue(_contains(svg1, bytes(SPARKLES)), unicode"трейт 1 — golden-искорки на животике");
        assertFalse(_contains(svg1, bytes(HAT)), unicode"трейт 1 — без беретика");

        bytes memory svg2 = _svgOf(_seed(SEED_TRAIT2), 7);
        assertTrue(_contains(svg2, bytes(HAT)), unicode"трейт 2 — golden беретик");
        assertFalse(_contains(svg2, bytes(SPARKLES)), unicode"трейт 2 — без искорок");

        bytes memory svg3 = _svgOf(_seed(SEED_TRAIT3), 7);
        assertTrue(_contains(svg3, bytes(SPARKLES)) && _contains(svg3, bytes(HAT)), unicode"трейт 3 — весь наряд");
    }

    function test_NoMutationLayerWhenTraitZero() public pure {
        bytes memory svg = _svgOf(_seed(SEED_GATE), 7);
        assertFalse(_contains(svg, bytes(GOLD_FILL)), unicode"без мутации золотого слоя нет");
        assertFalse(_contains(svg, bytes(SPARKLES)), unicode"без мутации искорок нет");
        assertFalse(_contains(svg, bytes(HAT)), unicode"без мутации беретика нет");
    }

    /// Перегрузка art(seed) (сигнатура tc-03) = малыш до эволюции: золотой
    /// слой не рисуется даже у сида, который мутирует на level 7.
    function test_OneArgArtStaysMutationFree() public pure {
        bytes memory svg = _svgOfBaby(_seed(SEED_TRAIT3));
        assertFalse(_contains(svg, bytes(GOLD_FILL)), unicode"art(seed) — малыш без мутаций");
    }

    // ---------- интеграция: on-chain tokenURI считается с level ----------

    function test_TokenUriUsesLevelForMutation() public {
        Critter critter = new Critter();
        uint256 tokenId = critter.mintTo(address(this));
        uint256 dna = critter.critter(tokenId).dnaSeed;

        // малыш: URI ровно как art с нулевым level (и совпадает с tc-03 art(seed))
        assertEq(critter.tokenURI(tokenId), Render.art(dna, 0), unicode"URI малыша без мутаций");

        // пять актов заботы → level 5 (первая эволюция) — URI уже считается с level
        for (uint256 i; i < 5; i++) {
            critter.feed(1);
        }
        assertEq(critter.critter(tokenId).level, 5, unicode"после пяти актов level 5");
        assertEq(critter.tokenURI(tokenId), Render.art(dna, 5), unicode"URI подросшего считается с level");

        // мутация проявляется в on-chain арте ровно тогда, когда её даёт формула
        bool mutated = keccak256(bytes(critter.tokenURI(tokenId))) != keccak256(bytes(Render.art(dna, 0)));
        assertEq(mutated, Render.mutationTrait(dna, 5) > 0, unicode"golden-слой в URI согласован с трейтом");
    }

    // ---------- тестовые хелперы (строковые, как в Render.t.sol) ----------

    function _seed(uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(i)));
    }

    /// Честный SVG из data-URI: отрезаем префикс и декодируем base64
    function _svgOf(uint256 seed, uint8 level) internal pure returns (bytes memory) {
        return _decode(Render.art(seed, level));
    }

    function _svgOfBaby(uint256 seed) internal pure returns (bytes memory) {
        return _decode(Render.art(seed));
    }

    function _decode(string memory uri) internal pure returns (bytes memory) {
        string memory b64 = _slice(uri, bytes(DATA_PREFIX).length, bytes(uri).length - bytes(DATA_PREFIX).length);
        return _b64Decode(b64);
    }

    function _contains(bytes memory hay, bytes memory needle) internal pure returns (bool) {
        if (hay.length < needle.length) return false;
        for (uint256 i; i + needle.length <= hay.length; i++) {
            uint256 j;
            while (j < needle.length && hay[i + j] == needle[j]) j++;
            if (j == needle.length) return true;
        }
        return false;
    }

    function _slice(string memory s, uint256 from, uint256 len) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        require(from + len <= b.length, "slice out of bounds");
        bytes memory out = new bytes(len);
        for (uint256 i; i < len; i++) {
            out[i] = b[from + i];
        }
        return string(out);
    }

    function _b64Decode(string memory encoded) internal pure returns (bytes memory out) {
        bytes memory src = bytes(encoded);
        require(src.length % 4 == 0, "bad base64 length");

        uint256 pad;
        if (src[src.length - 1] == "=") {
            pad = src[src.length - 2] == "=" ? 2 : 1;
        }
        out = new bytes(src.length / 4 * 3 - pad);
        uint256 j;
        for (uint256 i; i < src.length; i += 4) {
            uint256 chunk = (_idx(src[i]) << 18) | (_idx(src[i + 1]) << 12) | (_idx(src[i + 2]) << 6) | _idx(src[i + 3]);
            if (j < out.length) out[j++] = bytes1(uint8(chunk >> 16));
            if (j < out.length) out[j++] = bytes1(uint8(chunk >> 8));
            if (j < out.length) out[j++] = bytes1(uint8(chunk));
        }
    }

    function _idx(bytes1 c) internal pure returns (uint256) {
        if (c >= bytes1("A") && c <= bytes1("Z")) return uint256(uint8(c)) - 65;
        if (c >= bytes1("a") && c <= bytes1("z")) return uint256(uint8(c)) - 71;
        if (c >= bytes1("0") && c <= bytes1("9")) return uint256(uint8(c)) + 4;
        if (c == bytes1("+")) return 62;
        return 63; // "/"
    }
}

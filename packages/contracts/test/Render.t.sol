// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Render} from "../src/render.sol";

contract RenderTest is Test {
    string constant DATA_PREFIX = "data:image/svg+xml;base64,";

    // ---------- детерминизм: один сид → один SVG ----------

    function test_SameSeedSameSvg() public pure {
        string memory a = Render.art(0xC0FFEE2023);
        string memory b = Render.art(0xC0FFEE2023);
        assertEq(a, b, unicode"один сид должен рисовать одну и ту же желейку");
    }

    function test_DifferentSeedsDifferentSvg() public pure {
        assertFalse(
            keccak256(bytes(Render.art(1))) == keccak256(bytes(Render.art(0xFF))),
            unicode"разные сиды — разный пухлик"
        );
    }

    // ---------- цвет тела: снапшоты из ДНК ----------

    function test_BodyColorSnapshot() public pure {
        // сид 1 = 0x000001: каналы 0,0,1 → каждый осветляется до 170 → #AAAAAA
        assertEq(Render.bodyColor(1), "#AAAAAA", unicode"снапшот: сид 1");
        // 0x53F0FF: r=83→197, g=240→250, b=255→255 → #C5FAFF
        assertEq(Render.bodyColor(0x53F0FF), "#C5FAFF", unicode"снапшот: сид 0x53F0FF");
    }

    function test_BodyColorDeterministic() public pure {
        assertEq(Render.bodyColor(0xBADA55BEEF), Render.bodyColor(0xBADA55BEEF));
    }

    function test_DifferentSeedsDifferentColors() public pure {
        assertNotEq(Render.bodyColor(1), Render.bodyColor(0xFF), unicode"другой сид — другой цвет");
    }

    // доктрина няшности: цвет тела обязан быть пастельным, не пугающим
    function test_BodyColorIsAlwaysPastel() public pure {
        for (uint256 i = 0; i < 8; i++) {
            string memory color = Render.bodyColor(uint256(keccak256(abi.encode(i))));
            (uint256 r, uint256 g, uint256 b) = _parseHex(color);
            assertTrue(r >= 0xAA, unicode"красный слишком насыщенный");
            assertTrue(g >= 0xAA, unicode"зелёный слишком насыщенный");
            assertTrue(b >= 0xAA, unicode"синий слишком насыщенный");
        }
    }

    // ---------- data-URI: префикс, декод, содержимое SVG ----------

    function test_UriStartsWithDataPrefix() public pure {
        assertTrue(_startsWith(Render.art(42), DATA_PREFIX), unicode"URI обязан начинаться с data:image/svg+xml;base64,");
    }

    function test_UriDoesNotLeakRawSvg() public pure {
        assertFalse(_contains(bytes(Render.art(42)), "<svg"), unicode"URI должен содержать base64, а не сырые теги");
    }

    function test_UriDecodesToSvg() public pure {
        uint256 seed = 0xFACEB00C;
        string memory uri = Render.art(seed);
        string memory b64 = _slice(uri, bytes(DATA_PREFIX).length, bytes(uri).length - bytes(DATA_PREFIX).length);

        bytes memory svg = _b64Decode(b64);
        assertTrue(_contains(svg, "<svg"), unicode"внутри URI прячется SVG");
        assertTrue(_contains(svg, '</svg>'), unicode"SVG должен закрываться");
        assertTrue(_contains(svg, 'xmlns="http://www.w3.org/2000/svg"'), unicode"SVG без xmlns — не SVG");
        assertTrue(_contains(svg, bytes(Render.bodyColor(seed))), unicode"цвет тела обязан попасть в SVG");

        // vm из forge-std: перекодируем — roundtrip должен совпасть
        assertEq(vm.toBase64(svg), b64, "decode->encode roundtrip");
    }

    // ---------- снапшоты формы глаз и узора ----------

    /// сиды точно попадают в нужный вариант: (seed >> 64) % 3 для глаз,
    /// (seed >> 96) % 3 для узора
    function test_EyeShapeSnapshot() public pure {
        // сид без сдвига → kind 0
        assertTrue(
            _contains(_svgOf(1), '<circle cx="81.5" cy="93.5" r="3.6"'),
            unicode"kind 0 — большие круглые глаза с бликом"
        );
        // 1 << 64 → kind 1: дуги-улыбка
        assertTrue(
            _contains(_svgOf(1 << 64), "Q78 89 87 100"),
            unicode"kind 1 — счастливые прикрытые глазки"
        );
        // 2 << 64 → kind 2: искорки
        assertTrue(
            _contains(_svgOf(2 << 64), "M78 91 L80 94 L78 97 L76 94 Z"),
            unicode"kind 2 — звёздочки в глазах"
        );
    }

    function test_PatternSnapshot() public pure {
        assertTrue(_contains(_svgOf(1), 'cx="100" cy="156"'), unicode"kind 0 — крапинки");
        assertTrue(
            _contains(_svgOf(1 << 96), "#FF9FBF"),
            unicode"kind 1 — сердечки"
        );
        assertTrue(
            _contains(_svgOf(2 << 96), "#FFE9A8"),
            unicode"kind 2 — искорки-узор"
        );
    }

    function test_EyeShapeAndArtDeterministic() public pure {
        assertEq(Render.art(1 << 64), Render.art(1 << 64), unicode"глазки-дуги тоже детерминированы");
    }

    /// Достаём честный SVG из data-URI: отрезаем префикс и декодируем base64
    function _svgOf(uint256 seed) internal pure returns (bytes memory) {
        string memory uri = Render.art(seed);
        string memory b64 = _slice(uri, bytes(DATA_PREFIX).length, bytes(uri).length - bytes(DATA_PREFIX).length);
        return _b64Decode(b64);
    }

    // ---------- тестовые хелперы (строковые) ----------

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory b = bytes(s);
        bytes memory p = bytes(prefix);
        if (b.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (b[i] != p[i]) return false;
        }
        return true;
    }

    function _contains(bytes memory hay, bytes memory needle) internal pure returns (bool) {
        if (hay.length < needle.length) return false;
        for (uint256 i = 0; i + needle.length <= hay.length; i++) {
            uint256 j = 0;
            while (j < needle.length && hay[i + j] == needle[j]) j++;
            if (j == needle.length) return true;
        }
        return false;
    }

    function _slice(string memory s, uint256 from, uint256 len) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        require(from + len <= b.length, "slice out of bounds");
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = b[from + i];
        }
        return string(out);
    }

    function _parseHex(string memory color) internal pure returns (uint256 r, uint256 g, uint256 b) {
        bytes memory s = bytes(color);
        assertEq(s.length, 7, unicode"цвет обязан быть #RRGGBB");
        r = _byte(s[1], s[2]);
        g = _byte(s[3], s[4]);
        b = _byte(s[5], s[6]);
    }

    function _byte(bytes1 hi, bytes1 lo) internal pure returns (uint256) {
        return _nibble(hi) * 16 + _nibble(lo);
    }

    function _nibble(bytes1 c) internal pure returns (uint256) {
        if (c >= bytes1("0") && c <= bytes1("9")) return uint256(uint8(c)) - 48;
        return uint256(uint8(c)) - 55; // 'A'..'F'
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
        for (uint256 i = 0; i < src.length; i += 4) {
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

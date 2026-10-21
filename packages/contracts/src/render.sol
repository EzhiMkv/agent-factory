// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

/// @title Render — он-чейн арт пухлика: желейка рисуется из ДНК
/// @notice Пастельная желейка: цвет тела — 24 бит из ДНК (осветляем до няшной
/// пастели), форма глаз и узор выбираются детерминированно от сида.
library Render {
    string internal constant DATA_URI_PREFIX = "data:image/svg+xml;base64,";
    bytes internal constant _B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    string internal constant _INK = "#5B4F6E";

    /// Токен-URI пухлика: inline SVG без хоста и метаданных снаружи
    function art(uint256 dnaSeed) internal pure returns (string memory) {
        return string(abi.encodePacked(DATA_URI_PREFIX, _b64Encode(bytes(_svg(dnaSeed)))));
    }

    /// Цвет тела: 24 бит из ДНК, сдвинут на 2/3 пути к белому — чтобы пухлик
    /// всегда выходил пастельным и мягким, а не пугающим
    function bodyColor(uint256 dnaSeed) internal pure returns (string memory) {
        uint256 raw = dnaSeed & 0xFFFFFF;
        uint256 r = (((raw >> 16) & 0xFF) + 510) / 3;
        uint256 g = (((raw >> 8) & 0xFF) + 510) / 3;
        uint256 b = ((raw & 0xFF) + 510) / 3;
        return _hexColor((r << 16) | (g << 8) | b);
    }

    function _svg(uint256 dna) internal pure returns (string memory) {
        string memory fur = bodyColor(dna);
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">',
                _defs(),
                '<rect width="200" height="200" fill="url(#bg)"/>',
                '<ellipse cx="70" cy="54" rx="13" ry="11" fill="', fur, '"/>',
                '<ellipse cx="130" cy="54" rx="13" ry="11" fill="', fur, '"/>',
                '<ellipse cx="70" cy="55" rx="6.5" ry="5.5" fill="#FFFFFF" opacity="0.4"/>',
                '<ellipse cx="130" cy="55" rx="6.5" ry="5.5" fill="#FFFFFF" opacity="0.4"/>',
                '<ellipse cx="100" cy="112" rx="63" ry="59" fill="', fur, '"/>',
                '<ellipse cx="100" cy="112" rx="63" ry="59" fill="url(#gloss)"/>',
                '<ellipse cx="76" cy="74" rx="26" ry="15" fill="#FFFFFF" opacity="0.25"/>',
                _cheeks(),
                _eyes(dna),
                '<path d="M90 130 Q100 141 110 130" stroke="#5B4F6E" stroke-width="3.2" stroke-linecap="round" fill="none"/>',
                _pattern(dna),
                '</svg>'
            )
        );
    }

    function _defs() internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<defs>",
                '<radialGradient id="bg" cx="0.25" cy="0.2" r="1"><stop offset="0" stop-color="#FFFDF9"/><stop offset="1" stop-color="#F7ECF6"/></radialGradient>',
                '<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.65"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>',
                '<radialGradient id="cheek" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFB6C8" stop-opacity="0.8"/><stop offset="1" stop-color="#FFB6C8" stop-opacity="0"/></radialGradient>',
                "</defs>"
            )
        );
    }

    function _cheeks() internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '<ellipse cx="64" cy="124" rx="11" ry="8" fill="url(#cheek)"/>',
                '<ellipse cx="136" cy="124" rx="11" ry="8" fill="url(#cheek)"/>'
            )
        );
    }

    /// Форма глаз — по сиду: большие круглые с бликами / дуги-улыбка / глазки-искорки
    function _eyes(uint256 dna) internal pure returns (string memory) {
        uint256 kind = (dna >> 64) % 3;
        if (kind == 0) {
            return string(
                abi.encodePacked(
                    '<circle cx="78" cy="97" r="10.5" fill="#5B4F6E"/>',
                    '<circle cx="122" cy="97" r="10.5" fill="#5B4F6E"/>',
                    '<circle cx="81.5" cy="93.5" r="3.6" fill="#FFFFFF"/>',
                    '<circle cx="125.5" cy="93.5" r="3.6" fill="#FFFFFF"/>',
                    '<circle cx="74.5" cy="99.5" r="1.9" fill="#FFFFFF" opacity="0.9"/>',
                    '<circle cx="118.5" cy="99.5" r="1.9" fill="#FFFFFF" opacity="0.9"/>'
                )
            );
        }
        if (kind == 1) {
            return string(
                abi.encodePacked(
                    '<path d="M69 100 Q78 89 87 100" stroke="#5B4F6E" stroke-width="3.4" stroke-linecap="round" fill="none"/>',
                    '<path d="M113 100 Q122 89 131 100" stroke="#5B4F6E" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
                )
            );
        }
        return string(
            abi.encodePacked(
                '<circle cx="78" cy="97" r="10.5" fill="#5B4F6E"/>',
                '<circle cx="122" cy="97" r="10.5" fill="#5B4F6E"/>',
                '<path d="M78 91 L80 94 L78 97 L76 94 Z" fill="#FFFFFF"/>',
                '<path d="M122 91 L124 94 L122 97 L120 94 Z" fill="#FFFFFF"/>',
                '<circle cx="82" cy="94" r="2.6" fill="#FFFFFF" opacity="0.85"/>',
                '<circle cx="126" cy="94" r="2.6" fill="#FFFFFF" opacity="0.85"/>'
            )
        );
    }

    /// Узор на животике — по сиду: милые крапинки / сердечки / искорки
    function _pattern(uint256 dna) internal pure returns (string memory) {
        uint256 kind = (dna >> 96) % 3;
        if (kind == 0) {
            return string(
                abi.encodePacked(
                    '<circle cx="72" cy="148" r="4" fill="#FFFFFF" opacity="0.75"/>',
                    '<circle cx="100" cy="156" r="3.2" fill="#FFFFFF" opacity="0.75"/>',
                    '<circle cx="128" cy="148" r="4" fill="#FFFFFF" opacity="0.75"/>'
                )
            );
        }
        if (kind == 1) {
            return string(
                abi.encodePacked(
                    '<path d="M128 148 C 122 142 115 149 128 154 C 141 149 134 142 128 148 Z" fill="#FF9FBF"/>',
                    '<path d="M76 152 C 72 148 68 152 76 156 C 84 152 80 148 76 152 Z" fill="#FF9FBF" opacity="0.85"/>'
                )
            );
        }
        return string(
            abi.encodePacked(
                '<path d="M128 139 L130 144 L135 146 L130 148 L128 153 L126 148 L121 146 L126 144 Z" fill="#FFE9A8"/>',
                '<path d="M76 146 L77.5 148.8 L81 150.4 L77.5 152 L76 154.8 L74.5 152 L71 150.4 L74.5 148.8 Z" fill="#FFE9A8" opacity="0.9"/>'
            )
        );
    }

    function _hexColor(uint256 value) internal pure returns (string memory) {
        bytes memory digits = "0123456789ABCDEF";
        bytes memory out = new bytes(7);
        out[0] = "#";
        for (uint256 i = 0; i < 6; i++) {
            out[i + 1] = digits[(value >> (4 * (5 - i))) & 0xF];
        }
        return string(out);
    }

    function _b64Encode(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) {
            return "";
        }
        bytes memory out = new bytes(4 * ((data.length + 2) / 3));
        uint256 j;
        for (uint256 i = 0; i < data.length; i += 3) {
            uint256 chunk = (uint256(uint8(data[i])) << 16)
                | (i + 1 < data.length ? uint256(uint8(data[i + 1])) << 8 : 0)
                | (i + 2 < data.length ? uint256(uint8(data[i + 2])) : 0);
            out[j++] = _B64[(chunk >> 18) & 0x3F];
            out[j++] = _B64[(chunk >> 12) & 0x3F];
            out[j++] = i + 1 < data.length ? _B64[(chunk >> 6) & 0x3F] : bytes1("=");
            out[j++] = i + 2 < data.length ? _B64[chunk & 0x3F] : bytes1("=");
        }
        return string(out);
    }
}

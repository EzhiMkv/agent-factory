// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IERC6551Registry} from "./erc6551/Registry.sol";

// Хук, который Critter дёргает ровно в момент emit Evolved (tc-08)
interface IEvolutionHook {
    function onEvolved(uint256 tokenId, uint8 stage) external;
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

// Ачивки-майлстоуны: за каждую эволюцию пухлик получает маленький NFT,
// который минтится сразу в его ERC-6551 кошелёк (TBA).
contract Achievements is IEvolutionHook {
    string public constant name = "Puhlyandiya Milestones";
    string public constant symbol = "PUH-A";

    event AchievementUnlocked(uint256 indexed critterTokenId, uint8 indexed stage, uint256 milestoneId);

    error NotCritter();

    address public immutable critter; // единственный, кто может дёргать хук
    address public immutable registry;
    address public immutable accountImpl; // реализация TBA для предсказания адреса
    bytes32 public immutable accountSalt; // тот же соль, что у Registry.createAccount

    struct Milestone {
        uint256 critterTokenId;
        uint8 stage;
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => Milestone) private _milestones;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    // Последняя стадия, за которую пухлик уже получил ачивку (стадии только растут)
    mapping(uint256 => uint8) public highestAwarded;

    constructor(address critter_, address registry_, address accountImpl_, bytes32 accountSalt_) {
        critter = critter_;
        registry = registry_;
        accountImpl = accountImpl_;
        accountSalt = accountSalt_;
    }

    // Вызывается самим Critter при пересечении порога эволюции.
    // Идемпотентно: вызов с не-большей стадией — тихий no-op, уход не ломается.
    function onEvolved(uint256 tokenId, uint8 stage) external {
        if (msg.sender != critter) revert NotCritter();
        if (stage <= highestAwarded[tokenId]) return;

        highestAwarded[tokenId] = stage;

        // Кошелёк пухлика: детерминированный адрес TBA по ERC-6551.
        // Минтим на предсказанный адрес — работает, даже если TBA ещё не задеплоен.
        address tba = tbaOf(tokenId);

        uint256 milestoneId = _nextTokenId++;
        _owners[milestoneId] = tba;
        _balances[tba]++;
        _milestones[milestoneId] = Milestone({critterTokenId: tokenId, stage: stage});

        // safeTransfer-семантика: аккаунт-контракт должен принять NFT
        // (onERC721Received; пустой returndata = EOA/ещё не задеплоен)
        (bool ok, bytes memory ret) = tba.call(
            abi.encodeCall(IERC721Receiver.onERC721Received, (msg.sender, address(0), milestoneId, ""))
        );
        require(
            ok && (ret.length == 0 || abi.decode(ret, (bytes4)) == IERC721Receiver.onERC721Received.selector),
            unicode"пухлик не принял ачивку"
        );

        emit AchievementUnlocked(tokenId, stage, milestoneId);
    }

    // Предсказанный TBA-адрес пухлика (параметры те же, что у Registry.createAccount)
    function tbaOf(uint256 tokenId) public view returns (address) {
        return IERC6551Registry(registry).account(accountImpl, accountSalt, block.chainid, critter, tokenId);
    }

    function ownerOf(uint256 milestoneId) external view returns (address) {
        require(_owners[milestoneId] != address(0), "no achievement");
        return _owners[milestoneId];
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero address");
        return _balances[account];
    }

    function milestone(uint256 milestoneId) external view returns (Milestone memory) {
        require(_owners[milestoneId] != address(0), "no achievement");
        return _milestones[milestoneId];
    }

    // Getter для owner-а UI: все ачивки пухлика (id-шники milestone-NFT)
    function achievementsOf(uint256 tokenId) external view returns (uint256[] memory ids) {
        uint256 total = _nextTokenId - 1;
        uint256 count;
        for (uint256 i = 1; i <= total; i++) {
            if (_milestones[i].critterTokenId == tokenId) count++;
        }
        ids = new uint256[](count);
        uint256 j;
        for (uint256 i = 1; i <= total; i++) {
            if (_milestones[i].critterTokenId == tokenId) ids[j++] = i;
        }
    }
}

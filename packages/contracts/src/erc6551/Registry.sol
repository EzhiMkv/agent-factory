// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {TokenBoundAccount} from "./TokenBoundAccount.sol";

// Signature per ERC-6551: (implementation, salt, chainId, tokenContract, tokenId)
interface IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address account);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}

contract Registry is IERC6551Registry {
    // ERC-1167 minimal proxy: deploy preamble + runtime forwarder + tail
    bytes20 private constant CLONE_HEAD = hex"3d602d80600a3d3981f3363d3d373d3d3d363d73";
    bytes15 private constant CLONE_TAIL = hex"5af43d82803e903d91602b57fd5bf3";

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address accountAddress) {
        accountAddress = account(implementation, salt, chainId, tokenContract, tokenId);
        // Idempotent re-run: reuse the already deployed account
        if (accountAddress.code.length != 0) return accountAddress;

        bytes memory creationCode = abi.encodePacked(CLONE_HEAD, bytes20(implementation), CLONE_TAIL);
        bytes32 implSalt = keccak256(abi.encode(implementation, salt, chainId, tokenContract, tokenId));
        assembly {
            accountAddress := create2(0, add(creationCode, 0x20), mload(creationCode), implSalt)
        }
        require(accountAddress != address(0), "CREATE2 failed");

        // Atomic init of the clone's own storage (binding to the token)
        (bool ok, ) = accountAddress.call(abi.encodeCall(TokenBoundAccount.initialize, (chainId, tokenContract, tokenId)));
        require(ok, "Account init failed");
    }

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) public view returns (address) {
        bytes32 implSalt = keccak256(abi.encode(implementation, salt, chainId, tokenContract, tokenId));
        bytes32 codeHash = keccak256(abi.encodePacked(CLONE_HEAD, bytes20(implementation), CLONE_TAIL));
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), implSalt, codeHash))))
        );
    }
}

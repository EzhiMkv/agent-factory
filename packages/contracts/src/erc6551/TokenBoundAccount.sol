// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}

interface IERC6551Account {
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);

    function state() external view returns (uint256);

    function isValidSigner(address signer, bytes calldata payload) external view returns (bytes4 magicValue);
}

contract TokenBoundAccount is IERC6551Account {
    error AlreadyInitialized();
    error NotTokenOwner();
    error ExecuteFailed(bytes returnData);

    bool private _initialized;
    uint256 private _chainId;
    address private _tokenContract;
    uint256 private _tokenId;
    uint256 private _state;

    function initialize(uint256 chainId, address tokenContract, uint256 tokenId) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        _chainId = chainId;
        _tokenContract = tokenContract;
        _tokenId = tokenId;
    }

    receive() external payable {}

    function execute(address to, uint256 value, bytes calldata data) external payable returns (bytes memory) {
        if (!_isTokenOwner()) revert NotTokenOwner();
        _state++;
        (bool success, bytes memory result) = to.call{value: value}(data);
        if (!success) revert ExecuteFailed(result);
        return result;
    }

    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId) { return (_chainId, _tokenContract, _tokenId); }

    function state() external view returns (uint256) { return _state; }

    function isValidSigner(address signer, bytes calldata payload) external view returns (bytes4 magicValue) {
        if (_isTokenOwner()) return IERC6551Account.isValidSigner.selector;
        return bytes4(0xffffffff); // non-magic → signer invalid
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC6551Account).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _isTokenOwner() internal view returns (bool) {
        return IERC721(_tokenContract).ownerOf(_tokenId) == msg.sender;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    mapping(uint256 => address) public whitelistSlots;
    mapping(uint256 => bool) public usedSlots;

    event SlotAssigned(uint256 indexed slotId, address indexed holder);
    event SlotMinted(
        uint256 indexed slotId,
        address indexed minter,
        uint256 tokenId
    );

    constructor() ERC721("Mock NFT", "MNFT") {
        _nextTokenId = 1;
    }

    function assignSlot(uint256 slotId, address holder) external onlyOwner {
        require(whitelistSlots[slotId] == address(0), "Slot already assigned");
        whitelistSlots[slotId] = holder;
        emit SlotAssigned(slotId, holder);
    }

    function mintWithSlot(
        uint256 slotId,
        address to
    ) external returns (uint256 tokenId) {
        require(whitelistSlots[slotId] == msg.sender, "Not slot holder");
        require(!usedSlots[slotId], "Slot already used");
        usedSlots[slotId] = true;
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
        emit SlotMinted(slotId, msg.sender, tokenId);
    }

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
    }

    function isSlotHolder(
        uint256 slotId,
        address holder
    ) external view returns (bool) {
        return whitelistSlots[slotId] == holder;
    }
}

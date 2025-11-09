pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TryOnFHE is ZamaEthereumConfig {
    
    struct BodyProfile {
        string profileId;                   
        euint32 encryptedMeasurements;      
        uint256 publicAttributes;           
        string metadata;                    
        address owner;                      
        uint256 creationTime;               
        uint32 decryptedMeasurements;       
        bool isDecrypted;                   
    }
    
    mapping(string => BodyProfile) public bodyProfiles;
    string[] public profileIds;
    
    event ProfileCreated(string indexed profileId, address indexed owner);
    event DecryptionCompleted(string indexed profileId, uint32 measurements);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function createBodyProfile(
        string calldata profileId,
        externalEuint32 encryptedMeasurements,
        bytes calldata inputProof,
        uint256 publicAttributes,
        string calldata metadata
    ) external {
        require(bytes(bodyProfiles[profileId].profileId).length == 0, "Profile already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedMeasurements, inputProof)), "Invalid encrypted input");
        
        bodyProfiles[profileId] = BodyProfile({
            profileId: profileId,
            encryptedMeasurements: FHE.fromExternal(encryptedMeasurements, inputProof),
            publicAttributes: publicAttributes,
            metadata: metadata,
            owner: msg.sender,
            creationTime: block.timestamp,
            decryptedMeasurements: 0,
            isDecrypted: false
        });
        
        FHE.allowThis(bodyProfiles[profileId].encryptedMeasurements);
        FHE.makePubliclyDecryptable(bodyProfiles[profileId].encryptedMeasurements);
        
        profileIds.push(profileId);
        emit ProfileCreated(profileId, msg.sender);
    }
    
    function decryptMeasurements(
        string calldata profileId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(bodyProfiles[profileId].profileId).length > 0, "Profile does not exist");
        require(!bodyProfiles[profileId].isDecrypted, "Data already decrypted");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(bodyProfiles[profileId].encryptedMeasurements);
        
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        bodyProfiles[profileId].decryptedMeasurements = decodedValue;
        bodyProfiles[profileId].isDecrypted = true;
        
        emit DecryptionCompleted(profileId, decodedValue);
    }
    
    function getEncryptedMeasurements(string calldata profileId) external view returns (euint32) {
        require(bytes(bodyProfiles[profileId].profileId).length > 0, "Profile does not exist");
        return bodyProfiles[profileId].encryptedMeasurements;
    }
    
    function getBodyProfile(string calldata profileId) external view returns (
        string memory profileIdValue,
        uint256 publicAttributes,
        string memory metadata,
        address owner,
        uint256 creationTime,
        bool isDecrypted,
        uint32 decryptedMeasurements
    ) {
        require(bytes(bodyProfiles[profileId].profileId).length > 0, "Profile does not exist");
        BodyProfile storage profile = bodyProfiles[profileId];
        
        return (
            profile.profileId,
            profile.publicAttributes,
            profile.metadata,
            profile.owner,
            profile.creationTime,
            profile.isDecrypted,
            profile.decryptedMeasurements
        );
    }
    
    function getAllProfileIds() external view returns (string[] memory) {
        return profileIds;
    }
    
    function serviceAvailable() public pure returns (bool) {
        return true;
    }
}


import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface TryOnData {
  id: number;
  name: string;
  bodyMeasurements: string;
  clothingType: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface FitAnalysis {
  comfortScore: number;
  styleMatch: number;
  sizeAccuracy: number;
  recommendation: number;
  trendScore: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [tryOns, setTryOns] = useState<TryOnData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingTryOn, setCreatingTryOn] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newTryOnData, setNewTryOnData] = useState({ 
    name: "", 
    height: "", 
    weight: "", 
    clothingType: "dress" 
  });
  const [selectedTryOn, setSelectedTryOn] = useState<TryOnData | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ measurements: number | null }>({ measurements: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [operationHistory, setOperationHistory] = useState<string[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
        addToHistory("FHEVM system initialized successfully");
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
        addToHistory("Virtual try-on data loaded");
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const addToHistory = (operation: string) => {
    setOperationHistory(prev => [
      `${new Date().toLocaleTimeString()}: ${operation}`,
      ...prev.slice(0, 9)
    ]);
  };

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const tryOnsList: TryOnData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          tryOnsList.push({
            id: parseInt(businessId.replace('tryon-', '')) || Date.now(),
            name: businessData.name,
            bodyMeasurements: businessId,
            clothingType: "Virtual Try-On",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setTryOns(tryOnsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createTryOn = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingTryOn(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating virtual try-on with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const heightValue = parseInt(newTryOnData.height) || 0;
      const businessId = `tryon-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, heightValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newTryOnData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newTryOnData.weight) || 0,
        0,
        `Virtual Try-On: ${newTryOnData.clothingType}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Virtual try-on created successfully!" });
      addToHistory(`Created virtual try-on: ${newTryOnData.name}`);
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewTryOnData({ name: "", height: "", weight: "", clothingType: "dress" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingTryOn(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Body data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      addToHistory(`Decrypted body measurements for try-on session`);
      
      setTransactionStatus({ visible: true, status: "success", message: "Body data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "FHE virtual try-on system is available" 
        });
        addToHistory("Checked system availability - System operational");
      }
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const analyzeFit = (tryOn: TryOnData, decryptedHeight: number | null): FitAnalysis => {
    const height = tryOn.isVerified ? (tryOn.decryptedValue || 0) : (decryptedHeight || tryOn.publicValue1 || 170);
    const weight = tryOn.publicValue1 || 60;
    
    const baseComfort = Math.min(100, Math.round((height * 0.2 + weight * 0.3) * 2));
    const comfortScore = Math.max(60, Math.min(95, baseComfort));
    
    const styleMatch = Math.round((height % 10 + weight % 10) * 8);
    const sizeAccuracy = Math.round(100 - Math.abs(height - 170) * 0.5);
    const recommendation = Math.round((comfortScore + styleMatch + sizeAccuracy) / 3);
    const trendScore = Math.round((styleMatch * 0.6 + comfortScore * 0.4) * 0.9);

    return {
      comfortScore,
      styleMatch,
      sizeAccuracy,
      recommendation,
      trendScore
    };
  };

  const renderDashboard = () => {
    const totalSessions = tryOns.length;
    const verifiedSessions = tryOns.filter(t => t.isVerified).length;
    const avgWeight = tryOns.length > 0 
      ? tryOns.reduce((sum, t) => sum + t.publicValue1, 0) / tryOns.length 
      : 0;
    
    const recentSessions = tryOns.filter(t => 
      Date.now()/1000 - t.timestamp < 60 * 60 * 24 * 7
    ).length;

    return (
      <div className="dashboard-panels">
        <div className="panel gradient-panel">
          <h3>Total Try-On Sessions</h3>
          <div className="stat-value">{totalSessions}</div>
          <div className="stat-trend">+{recentSessions} this week</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>FHE Verified Data</h3>
          <div className="stat-value">{verifiedSessions}/{totalSessions}</div>
          <div className="stat-trend">Encrypted & Verified</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>Avg Weight</h3>
          <div className="stat-value">{avgWeight.toFixed(1)}kg</div>
          <div className="stat-trend">Privacy Protected</div>
        </div>
      </div>
    );
  };

  const renderFitAnalysis = (tryOn: TryOnData, decryptedHeight: number | null) => {
    const analysis = analyzeFit(tryOn, decryptedHeight);
    
    return (
      <div className="analysis-chart">
        <div className="chart-row">
          <div className="chart-label">Comfort Score</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.comfortScore}%` }}
            >
              <span className="bar-value">{analysis.comfortScore}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Style Match</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.styleMatch}%` }}
            >
              <span className="bar-value">{analysis.styleMatch}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Size Accuracy</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.sizeAccuracy}%` }}
            >
              <span className="bar-value">{analysis.sizeAccuracy}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Recommendation</div>
          <div className="chart-bar">
            <div 
              className="bar-fill growth" 
              style={{ width: `${analysis.recommendation}%` }}
            >
              <span className="bar-value">{analysis.recommendation}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const filteredTryOns = tryOns.filter(tryOn => 
    tryOn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tryOn.clothingType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE Virtual Try-On 🔐</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">👗</div>
            <h2>Private Virtual Try-On Experience</h2>
            <p>Connect your wallet to start encrypted virtual fitting sessions with complete privacy protection.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Upload encrypted body measurements</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Get personalized fit recommendations</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your body measurements</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading virtual try-on system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Virtual Try-On 👗</h1>
          <span className="tagline">Private Fashion Experience</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">
            Check System
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Try-On
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <nav className="app-nav">
        <button 
          className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button 
          className={`nav-btn ${activeTab === "tryons" ? "active" : ""}`}
          onClick={() => setActiveTab("tryons")}
        >
          Try-On Sessions
        </button>
        <button 
          className={`nav-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Operation History
        </button>
        <button 
          className={`nav-btn ${activeTab === "faq" ? "active" : ""}`}
          onClick={() => setActiveTab("faq")}
        >
          FAQ
        </button>
      </nav>
      
      <div className="main-content-container">
        {activeTab === "dashboard" && (
          <div className="dashboard-section">
            <h2>Virtual Try-On Analytics</h2>
            {renderDashboard()}
            
            <div className="panel gradient-panel full-width">
              <h3>FHE 🔐 Privacy Protection Flow</h3>
              <div className="fhe-flow">
                <div className="flow-step">
                  <div className="step-icon">1</div>
                  <div className="step-content">
                    <h4>Body Data Encryption</h4>
                    <p>Your measurements encrypted with Zama FHE 🔐</p>
                  </div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="step-icon">2</div>
                  <div className="step-content">
                    <h4>Secure Storage</h4>
                    <p>Encrypted data stored on-chain privately</p>
                  </div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="step-icon">3</div>
                  <div className="step-content">
                    <h4>Fit Analysis</h4>
                    <p>Personalized recommendations generated</p>
                  </div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="step-icon">4</div>
                  <div className="step-content">
                    <h4>Verified Results</h4>
                    <p>On-chain verification of fit data</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "tryons" && (
          <div className="tryons-section">
            <div className="section-header">
              <h2>Virtual Try-On Sessions</h2>
              <div className="header-actions">
                <input 
                  type="text"
                  placeholder="Search try-on sessions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <button 
                  onClick={loadData} 
                  className="refresh-btn" 
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="tryons-list">
              {filteredTryOns.length === 0 ? (
                <div className="no-tryons">
                  <p>No virtual try-on sessions found</p>
                  <button 
                    className="create-btn" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    Start First Session
                  </button>
                </div>
              ) : filteredTryOns.map((tryOn, index) => (
                <div 
                  className={`tryon-item ${selectedTryOn?.id === tryOn.id ? "selected" : ""} ${tryOn.isVerified ? "verified" : ""}`} 
                  key={index}
                  onClick={() => setSelectedTryOn(tryOn)}
                >
                  <div className="tryon-title">{tryOn.name}</div>
                  <div className="tryon-meta">
                    <span>Weight: {tryOn.publicValue1}kg</span>
                    <span>Created: {new Date(tryOn.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className="tryon-status">
                    Status: {tryOn.isVerified ? "✅ Body Data Verified" : "🔓 Ready for Verification"}
                    {tryOn.isVerified && tryOn.decryptedValue && (
                      <span className="verified-data">Height: {tryOn.decryptedValue}cm</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === "history" && (
          <div className="history-section">
            <h2>Operation History</h2>
            <div className="history-list">
              {operationHistory.length === 0 ? (
                <p>No operations recorded yet</p>
              ) : (
                operationHistory.map((op, index) => (
                  <div key={index} className="history-item">
                    {op}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "faq" && (
          <div className="faq-section">
            <h2>Frequently Asked Questions</h2>
            <div className="faq-list">
              <div className="faq-item">
                <h3>How does FHE protect my privacy?</h3>
                <p>Your body measurements are encrypted before being stored, ensuring complete privacy during virtual try-on sessions.</p>
              </div>
              <div className="faq-item">
                <h3>What data is encrypted?</h3>
                <p>Height measurements are fully encrypted using FHE technology. Weight is stored as public data for demonstration.</p>
              </div>
              <div className="faq-item">
                <h3>How accurate are the fit recommendations?</h3>
                <p>Recommendations are generated based on encrypted data analysis, providing personalized fit scores while maintaining privacy.</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {showCreateModal && (
        <ModalCreateTryOn 
          onSubmit={createTryOn} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingTryOn} 
          tryOnData={newTryOnData} 
          setTryOnData={setNewTryOnData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedTryOn && (
        <TryOnDetailModal 
          tryOn={selectedTryOn} 
          onClose={() => { 
            setSelectedTryOn(null); 
            setDecryptedData({ measurements: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedTryOn.bodyMeasurements)}
          renderFitAnalysis={renderFitAnalysis}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateTryOn: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  tryOnData: any;
  setTryOnData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, tryOnData, setTryOnData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'height' || name === 'weight') {
      const intValue = value.replace(/[^\d]/g, '');
      setTryOnData({ ...tryOnData, [name]: intValue });
    } else {
      setTryOnData({ ...tryOnData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-tryon-modal">
        <div className="modal-header">
          <h2>New Virtual Try-On Session</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Privacy Protection</strong>
            <p>Your height will be encrypted with Zama FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>Session Name *</label>
            <input 
              type="text" 
              name="name" 
              value={tryOnData.name} 
              onChange={handleChange} 
              placeholder="Enter session name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Height (cm) - FHE Encrypted *</label>
            <input 
              type="number" 
              name="height" 
              value={tryOnData.height} 
              onChange={handleChange} 
              placeholder="Enter height in cm..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Weight (kg) *</label>
            <input 
              type="number" 
              name="weight" 
              value={tryOnData.weight} 
              onChange={handleChange} 
              placeholder="Enter weight in kg..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">Public Data</div>
          </div>
          
          <div className="form-group">
            <label>Clothing Type</label>
            <select name="clothingType" value={tryOnData.clothingType} onChange={handleChange}>
              <option value="dress">Dress</option>
              <option value="shirt">Shirt</option>
              <option value="pants">Pants</option>
              <option value="jacket">Jacket</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !tryOnData.name || !tryOnData.height || !tryOnData.weight} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Start Try-On Session"}
          </button>
        </div>
      </div>
    </div>
  );
};

const TryOnDetailModal: React.FC<{
  tryOn: TryOnData;
  onClose: () => void;
  decryptedData: { measurements: number | null };
  setDecryptedData: (value: { measurements: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  renderFitAnalysis: (tryOn: TryOnData, decryptedHeight: number | null) => React.ReactNode;
}> = ({ tryOn, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData, renderFitAnalysis }) => {
  const handleDecrypt = async () => {
    if (decryptedData.measurements !== null) { 
      setDecryptedData({ measurements: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ measurements: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="tryon-detail-modal">
        <div className="modal-header">
          <h2>Virtual Try-On Session Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="tryon-info">
            <div className="info-item">
              <span>Session Name:</span>
              <strong>{tryOn.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{tryOn.creator.substring(0, 6)}...{tryOn.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(tryOn.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Public Weight:</span>
              <strong>{tryOn.publicValue1}kg</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Body Data</h3>
            
            <div className="data-row">
              <div className="data-label">Height Measurement:</div>
              <div className="data-value">
                {tryOn.isVerified && tryOn.decryptedValue ? 
                  `${tryOn.decryptedValue}cm (On-chain Verified)` : 
                  decryptedData.measurements !== null ? 
                  `${decryptedData.measurements}cm (Locally Decrypted)` : 
                  "🔒 FHE Encrypted Data"
                }
              </div>
              <button 
                className={`decrypt-btn ${(tryOn.isVerified || decryptedData.measurements !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Verifying..."
                ) : tryOn.isVerified ? (
                  "✅ Verified"
                ) : decryptedData.measurements !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Verify Data"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Privacy Protection</strong>
                <p>Your body data remains encrypted throughout the virtual try-on process.</p>
              </div>
            </div>
          </div>
          
          {(tryOn.isVerified || decryptedData.measurements !== null) && (
            <div className="analysis-section">
              <h3>Fit Analysis & Recommendations</h3>
              {renderFitAnalysis(
                tryOn, 
                tryOn.isVerified ? tryOn.decryptedValue || null : decryptedData.measurements
              )}
              
              <div className="decrypted-values">
                <div className="value-item">
                  <span>Height:</span>
                  <strong>
                    {tryOn.isVerified ? 
                      `${tryOn.decryptedValue}cm (Verified)` : 
                      `${decryptedData.measurements}cm (Decrypted)`
                    }
                  </strong>
                </div>
                <div className="value-item">
                  <span>Weight:</span>
                  <strong>{tryOn.publicValue1}kg</strong>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!tryOn.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


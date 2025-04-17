import React, { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import './App.css';

// Auto-detect content type
function detectContentType(text) {
  if (!text || text.trim() === '') return 'text';
  
  // Try to parse as JSON
  try {
    JSON.parse(text);
    return 'json';
  } catch (e) {}
  
  // Check for markdown indicators
  if (text.match(/^#+ |^\*\*.*\*\*$|^\- |^```/m)) {
    return 'markdown';
  }
  
  // Check for YAML indicators
  if (text.match(/^---\s*$/m) && text.match(/^[a-zA-Z0-9_-]+:\s*[^\s]/m)) {
    return 'yaml';
  }
  
  // Default to text if no specific format detected
  return 'text';
}

const App = () => {
  const [mode, setMode] = useState('create'); // 'create', 'view', 'notFound', 'countdown'
  const [messageText, setMessageText] = useState('');
  const [title, setTitle] = useState('');
  const [expirationPeriod, setExpirationPeriod] = useState('day');
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [shareableUrl, setShareableUrl] = useState('');
  const [countdown, setCountdown] = useState(15);
  const [messageDetails, setMessageDetails] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [contentType, setContentType] = useState('text');
  const [decryptedContent, setDecryptedContent] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isFormLocked, setIsFormLocked] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [decryptionError, setDecryptionError] = useState(null);

  useEffect(() => {
    // Check if we're viewing a message
    const path = window.location.pathname;
    const hash = window.location.hash.substring(1); // Remove the # character
    
    if (path.startsWith('/txt/')) {
      setMode('view');
      const uid = path.replace('/txt/', '');
      
      if (hash) {
        // We have both uid and key, attempt to fetch and decrypt
        fetchAndDecryptMessage(uid, hash);
      } else {
        setDecryptionError('Cannot decrypt message: missing decryption key');
      }
    }
  }, []);

  useEffect(() => {
    // Apply syntax highlighting after content is decrypted
    if (mode === 'view' && decryptedContent) {
      Prism.highlightAll();
    }
  }, [decryptedContent, mode]);

  useEffect(() => {
    // Countdown timer for burn after reading
    let interval;
    if (mode === 'countdown' && countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prevCountdown => prevCountdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      // Time's up, delete the message
      const uid = window.location.pathname.replace('/txt/', '');
      deletePaste(uid);
    }
    return () => clearInterval(interval);
  }, [countdown, mode]);

  const calculateExpiration = (period) => {
    const now = new Date();
    switch (period) {
      case 'day':
        return new Date(now.setDate(now.getDate() + 1)).toISOString();
      case 'week':
        return new Date(now.setDate(now.getDate() + 7)).toISOString();
      case 'month':
        return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
      case 'year':
        return new Date(now.setFullYear(now.getFullYear() + 1)).toISOString();
      default:
        return new Date(now.setDate(now.getDate() + 1)).toISOString();
    }
  };

  const generateIdAndKey = (period) => {
    // Generate different length IDs and keys based on expiration period
    let idLength, keyLength;
    
    switch (period) {
      case 'day':
        idLength = 8;
        keyLength = 16;
        break;
      case 'week':
        idLength = 10;
        keyLength = 24;
        break;
      case 'month':
        idLength = 12;
        keyLength = 32;
        break;
      case 'year':
        idLength = 16;
        keyLength = 48;
        break;
      default:
        idLength = 8;
        keyLength = 16;
    }
    
    const uid = nanoid(idLength);
    const key = nanoid(keyLength);
    
    return { uid, key };
  };

  const encryptMessage = async (text, key) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Convert the key to a crypto key
    const keyBuffer = new TextEncoder().encode(key);
    const hash = await crypto.subtle.digest('SHA-256', keyBuffer);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      cryptoKey,
      data
    );
    
    // Combine IV and encrypted data
    const encryptedArray = new Uint8Array(iv.length + encryptedData.byteLength);
    encryptedArray.set(iv, 0);
    encryptedArray.set(new Uint8Array(encryptedData), iv.length);
    
    // Convert to base64 for transmission
    return btoa(String.fromCharCode(...encryptedArray));
  };

  const decryptMessage = async (encryptedBase64, key) => {
    try {
      // Convert base64 back to array
      const encryptedString = atob(encryptedBase64);
      const encryptedArray = new Uint8Array(encryptedString.length);
      for (let i = 0; i < encryptedString.length; i++) {
        encryptedArray[i] = encryptedString.charCodeAt(i);
      }
      
      // Extract IV and encrypted data
      const iv = encryptedArray.slice(0, 12);
      const encryptedData = encryptedArray.slice(12);
      
      // Convert the key to a crypto key
      const keyBuffer = new TextEncoder().encode(key);
      const hash = await crypto.subtle.digest('SHA-256', keyBuffer);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        hash,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      // Decrypt the data
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv
        },
        cryptoKey,
        encryptedData
      );
      
      // Convert back to text
      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  };

  const handleCreateMessage = async (e) => {
    e.preventDefault();
    
    if (!messageText.trim()) {
      setStatusMessage('Please enter a message');
      return;
    }
    
    try {
      setStatusMessage('Encrypting and uploading message...');
      
      // Generate ID and key based on expiration period
      const { uid, key } = generateIdAndKey(expirationPeriod);
      
      // Detect content type
      const detectedType = detectContentType(messageText);
      setContentType(detectedType);
      
      // Create metadata
      const metadata = {
        title: title || 'Encrypted Message',
        dataType: detectedType,
        burnAfterReading: burnAfterReading
      };
      
      // Encrypt message with metadata
      const messageWithMetadata = JSON.stringify({
        content: messageText,
        metadata
      });
      
      const encryptedMessage = await encryptMessage(messageWithMetadata, key);
      
      // Calculate expiration date
      const expiresAt = calculateExpiration(expirationPeriod);
      
      // Send to server
      const response = await fetch('/api/paste', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uid,
          encryptedData: encryptedMessage,
          expiresAt,
          burnAfterReading
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create message');
      }
      
      // Generate shareable URL
      const shareableUrl = `${window.location.origin}/txt/${uid}#${key}`;
      setShareableUrl(shareableUrl);
      setStatusMessage('Message created successfully!');
      setIsFormLocked(true);
      setShowPopup(true);
      
    } catch (error) {
      console.error('Error creating message:', error);
      setStatusMessage('Error creating message: ' + error.message);
    }
  };

  const fetchAndDecryptMessage = async (uid, key) => {
    try {
      setIsDecrypting(true);
      setDecryptionError(null);
      
      // Fetch the encrypted message
      const response = await fetch(`/api/paste/${uid}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setIsDecrypting(false); // Stop loading state
          setMode('notFound');
          return;
        } else {
          throw new Error(`Failed to fetch message: ${response.status} ${response.statusText}`);
        }
        return;
      }
      
      const { encryptedData, expiresAt, burnAfterReading: burnFlag } = await response.json();
      
      // Decrypt the message
      try {
        const decryptedData = await decryptMessage(encryptedData, key);
        
        if (!decryptedData) {
          setDecryptionError('Failed to decrypt message. Invalid key or corrupted data.');
          setIsDecrypting(false);
          return;
        }
        
        // Parse the decrypted data
        const messageData = JSON.parse(decryptedData);
        const { content, metadata } = messageData;
      
        // Set title and content
        document.title = metadata.title || 'Encrypted Message';
        setDecryptedContent(content);
        setContentType(metadata.dataType || 'text');
        
        // Calculate expiration info
        const expireDate = new Date(expiresAt);
        const now = new Date();
        const diffTime = Math.abs(expireDate - now);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        setMessageDetails({
          title: metadata.title || 'Encrypted Message',
          expiresIn: `${diffDays} day${diffDays !== 1 ? 's' : ''}`,
          burnAfterReading: burnFlag
        });
        
        setIsDecrypting(false);
        
        // If burn after reading is enabled, start countdown
        if (burnFlag) {
          setMode('countdown');
        }
      } catch (error) {
        console.error('Decryption failed:', error);
        
        if (error.name === 'OperationError') {
          setDecryptionError('Decryption failed: Invalid key or URL. The message cannot be decrypted.');
        } else {
          setDecryptionError(`Decryption failed: ${error.message}`);
        }
        
        setIsDecrypting(false);
      }
    } catch (error) {
      console.error('Error fetching message:', error);
      setDecryptionError('Error: ' + error.message);
      setIsDecrypting(false);
    }
  };

  const cancelBurnAfterReading = () => {
    setMode('view');
    setStatusMessage('-burn after reading- cancelled');
  };

  const deletePaste = async (uid) => {
    try {
      const response = await fetch(`/api/del/${uid}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setMode('notFound');
        setStatusMessage('Message has been burned');
      } else {
        throw new Error('Failed to delete message');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      setStatusMessage('Error deleting message: ' + error.message);
    }
  };

  // Render functions for different modes
  const renderCreateForm = () => (
    <div className="create-container">
      <h1>WRITE MESSAGE</h1>
      <form onSubmit={handleCreateMessage} className={isFormLocked ? 'readonly-form' : ''}>
        <div className="form-group">
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            readOnly={isFormLocked}
          />
        </div>
        
        <div className="form-group">
          <textarea
            id="message"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Enter your message here (up to 1MB)"
            className="message-textarea"
            required
            readOnly={isFormLocked}
          />
        </div>
        
        <div className="form-group">
          <div className="expiration-options">
            <label>Hold message for:</label>
            <div className="expiration-option">
              <input
                type="radio"
                id="exp-day"
                name="expiration"
                value="day"
                checked={expirationPeriod === 'day'}
                onChange={(e) => setExpirationPeriod(e.target.value)}
                disabled={isFormLocked}
              />
              <label htmlFor="exp-day">1 day</label>
            </div>
            <div className="expiration-option">
              <input
                type="radio"
                id="exp-week"
                name="expiration"
                value="week"
                checked={expirationPeriod === 'week'}
                onChange={(e) => setExpirationPeriod(e.target.value)}
                disabled={isFormLocked}
              />
              <label htmlFor="exp-week">1 week</label>
            </div>
            <div className="expiration-option">
              <input
                type="radio"
                id="exp-month"
                name="expiration"
                value="month"
                checked={expirationPeriod === 'month'}
                onChange={(e) => setExpirationPeriod(e.target.value)}
                disabled={isFormLocked}
              />
              <label htmlFor="exp-month">1 month</label>
            </div>
            <div className="expiration-option">
              <input
                type="radio"
                id="exp-year"
                name="expiration"
                value="year"
                checked={expirationPeriod === 'year'}
                onChange={(e) => setExpirationPeriod(e.target.value)}
                disabled={isFormLocked}
              />
              <label htmlFor="exp-year">1 year</label>
            </div>
          </div>
        </div>
        
        <div className="form-group checkbox-group">
          <input
            type="checkbox"
            id="burn"
            checked={burnAfterReading}
            onChange={(e) => setBurnAfterReading(e.target.checked)}
            disabled={isFormLocked}
          />
          <label htmlFor="burn">Read Once</label>
        </div>
        
        <button 
          type="submit" 
          className={`push-button submit-btn ${isFormLocked ? 'button-disabled' : ''}`}
          disabled={isFormLocked}
        >
          <span className="shadow"></span>
          <span className="edge"></span>
          <span className="front">{isFormLocked ? 'ENCRYPTED' : 'ENCRYPT'}</span>
        </button>
      </form>
      
      {/* Share Popup */}
      {showPopup && shareableUrl && (
        <div className="share-popup-overlay">
          <div className="share-popup">
            <button 
              className="close-popup-btn" 
              onClick={() => {
                setShowPopup(false);
                setIsFormLocked(false);
              }}
            >
              ×
            </button>
            <h2>Message created successfully!</h2>
            <p>Share this link with anyone you want to access the encrypted message:</p>
            <div className="share-container">
              <div className="url-display">
                <input
                  type="text"
                  value={shareableUrl}
                  readOnly
                  onClick={(e) => e.target.select()}
                />
                <button 
                  className="push-button"
                  style={{ width: '100%' }}
                  onClick={() => {
                    navigator.clipboard.writeText(shareableUrl);
                  }}
                >
                  <span className="shadow"></span>
                  <span className="edge"></span>
                  <span className="front">Copy</span>
                </button>
              </div>
              <p className="warning-text">
                This link contains the decryption key in the URL fragment (#).
                The server never sees this key. Share this complete URL securely.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderViewMessage = () => (
    <div className="view-container">
      {messageDetails && (
        <>
          <h1>{messageDetails.title}</h1>
          <div className="message-info">
            <p>Expiring in: {messageDetails.expiresIn}</p>
            {messageDetails.burnAfterReading && <p>This message will be deleted after reading</p>}
          </div>
        </>
      )}
      
      <div className={`message-content ${contentType}`}>
        {contentType === 'markdown' ? (
          <div dangerouslySetInnerHTML={{ __html: decryptedContent }} />
        ) : (
          <pre><code className={`language-${contentType}`}>{decryptedContent}</code></pre>
        )}
      </div>
      
      <div className="view-actions">
        <button 
          onClick={() => {
            // Update the URL to the root path to reset
            window.history.pushState({}, '', '/');
            
            // Reset all state to initial values
            setMode('create');
            setMessageText('');
            setTitle('');
            setExpirationPeriod('day');
            setBurnAfterReading(false);
            setShareableUrl('');
            setCountdown(15);
            setMessageDetails(null);
            setStatusMessage('');
            setContentType('text');
            setDecryptedContent('');
            setIsDecrypting(false);
            setIsFormLocked(false);
            setShowPopup(false);
            setDecryptionError(null);
            
            // Reset document title
            document.title = 'Encrypted Messages';
          }} 
          className="push-button create-new-btn"
        >
          <span className="shadow"></span>
          <span className="edge"></span>
          <span className="front">Create New Message</span>
        </button>
      </div>
    </div>
  );

  const renderCountdown = () => (
    <div className="countdown-container">
      <h2>Burn After Reading</h2>
      <p>This message will be permanently deleted in {countdown} seconds</p>
      <div className="countdown-progress">
        <div 
          className="countdown-bar" 
          style={{ width: `${(countdown / 15) * 100}%` }}
        ></div>
      </div>
      <div className="countdown-actions">
        <button onClick={cancelBurnAfterReading} className="push-button cancel-btn">
          <span className="shadow"></span>
          <span className="edge"></span>
          <span className="front">Cancel Auto-Deletion</span>
        </button>
        <button 
          onClick={() => {
            // Update the URL to the root path to reset
            window.history.pushState({}, '', '/');
            
            // Reset all state to initial values
            setMode('create');
            setMessageText('');
            setTitle('');
            setExpirationPeriod('day');
            setBurnAfterReading(false);
            setShareableUrl('');
            setCountdown(15);
            setMessageDetails(null);
            setStatusMessage('');
            setContentType('text');
            setDecryptedContent('');
            setIsDecrypting(false);
            setIsFormLocked(false);
            setShowPopup(false);
            setDecryptionError(null);
            
            // Reset document title
            document.title = 'Encrypted Messages';
          }} 
          className="push-button create-new-btn"
        >
          <span className="shadow"></span>
          <span className="edge"></span>
          <span className="front">Create New Message</span>
        </button>
      </div>
      <div className="message-content">
        {contentType === 'markdown' ? (
          <div dangerouslySetInnerHTML={{ __html: decryptedContent }} />
        ) : (
          <pre><code className={`language-${contentType}`}>{decryptedContent}</code></pre>
        )}
      </div>
    </div>
  );

  const renderNotFound = () => (
    <div className="not-found">
      <div className="not-found-icon">📝❌</div>
      <h1>Message Not Found</h1>
      <p>This message may have:</p>
      <ul>
        <li>Expired (messages automatically expire after their set time period)</li>
        <li>Been deleted (burn-after-reading messages are permanently removed)</li>
        <li>Never existed (the URL might be incorrect)</li>
      </ul>
      <button 
        onClick={() => {
          // Update the URL to the root path to reset
          window.history.pushState({}, '', '/');
          
          // Reset all state to initial values
          setMode('create');
          setMessageText('');
          setTitle('');
          setExpirationPeriod('day');
          setBurnAfterReading(false);
          setShareableUrl('');
          setCountdown(15);
          setMessageDetails(null);
          setStatusMessage('');
          setContentType('text');
          setDecryptedContent('');
          setIsDecrypting(false);
          setIsFormLocked(false);
          setShowPopup(false);
          setDecryptionError(null);
          
          // Reset document title
          document.title = 'Encrypted Messages';
        }} 
        className="push-button go-back-btn"
      >
        <span className="shadow"></span>
        <span className="edge"></span>
        <span className="front">Create New Message</span>
      </button>
    </div>
  );

  // Main render
  return (
    <div className="app-container">
      {mode === 'notFound' ? (
        renderNotFound()
      ) : isDecrypting ? (
        <div className="loading">
          <span className="loading-text">Decrypting message...</span>
        </div>
      ) : decryptionError ? (
        <div className="error-message">
          <span className="error-text">{decryptionError}</span>
        </div>
      ) : (
        <>
          {mode === 'create' && renderCreateForm()}
          {mode === 'view' && renderViewMessage()}
          {mode === 'countdown' && renderCountdown()}
        </>
      )}
      
      <footer className="footer">
        <p>Disclaimer: We take no responsibility for messages created by individuals using this service.</p>
      </footer>
    </div>
  );
};

export default App;
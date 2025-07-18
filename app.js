const {
    initializeApp,
    getAuth,
    createUserWithEmailAndPassword, // No longer directly used for explicit sign-up
    signInWithEmailAndPassword,     // No longer directly used for explicit sign-in
    onAuthStateChanged,
    signInWithCustomToken,
    signInAnonymously,
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    collection,
    query,
    getDocs,
    onSnapshot
} = window.firebase;

// Access global variables
const appId = window.__app_id;
const firebaseConfig = JSON.parse(window.__firebase_config);
const initialAuthToken = window.__initial_auth_token;

// Define context for Firebase and User data
const AppContext = React.createContext(null);

// Custom Message Box component (replaces alert/confirm)
const MessageBox = ({ message, type = 'info', onClose, onConfirm }) => {
    if (!message) return null;

    const title = type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Information';

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full transform transition-all duration-300 scale-100 opacity-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className={`text-xl font-bold ${type === 'error' ? 'text-red-700' : 'text-blue-700'}`}>{title}</h3>
                    <button onClick={onClose || onConfirm} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
                </div>
                <p className="text-gray-700 mb-6">{message}</p>
                <div className="flex justify-end space-x-2">
                    {onConfirm && (
                        <button
                            onClick={onConfirm}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
                        >
                            OK
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition duration-200"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// High Five Tracker Component
const HighFiveTracker = () => {
    const { db, auth, userId, appId, userProfile, setUserProfile, isAuthReady, showMessage } = React.useContext(AppContext);
    const [loading, setLoading] = React.useState(true);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Function to fetch user data
    const fetchUserData = React.useCallback(async () => {
        if (!userId || !isAuthReady) return;

        setLoading(true);
        try {
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/userData/profile`);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                // Reset daily high fives if it's a new day
                if (data.lastHighFiveDate !== today) {
                    data.highFivesToday = 0;
                    data.lastHighFiveDate = today;
                    await setDoc(userDocRef, data); // Update Firestore with reset
                }
                setUserProfile(data);
            } else {
                // Initialize user data for new anonymous users
                console.warn("User profile not found, initializing new one for anonymous user.");
                const initialData = {
                    highFivesToday: 0,
                    totalHighFives: 0,
                    points: 0,
                    profileImage: 'dig-cat-1',
                    lastHighFiveDate: today,
                    username: `User-${userId.substring(0, 8)}` // Use part of UID as username
                };
                await setDoc(userDocRef, initialData);
                setUserProfile(initialData);

                // Also add to public leaderboard collection
                const leaderboardDocRef = doc(db, `artifacts/${appId}/public/data/leaderboard/${userId}`);
                await setDoc(leaderboardDocRef, {
                    username: initialData.username,
                    totalHighFives: 0
                });
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            showMessage("Failed to load user data.", 'error');
        } finally {
            setLoading(false);
        }
    }, [userId, db, appId, isAuthReady, setUserProfile, showMessage, today]);

    React.useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    // Listen for real-time updates to user profile
    React.useEffect(() => {
        if (!userId || !isAuthReady) return;

        const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/userData/profile`);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Client-side daily reset check for real-time updates
                if (data.lastHighFiveDate !== today && data.highFivesToday > 0) {
                    console.log("Detected new day, resetting daily high fives via snapshot.");
                    // This update will trigger another snapshot, but it's safe.
                    updateDoc(userDocRef, {
                        highFivesToday: 0,
                        lastHighFiveDate: today
                    }).catch(e => console.error("Error resetting daily high fives on snapshot:", e));
                } else {
                    setUserProfile(data);
                }
            } else {
                setUserProfile(null); // User data might have been deleted
            }
        }, (error) => {
            console.error("Error listening to user profile:", error);
            showMessage("Real-time updates failed.", 'error');
        });

        return () => unsubscribe(); // Cleanup listener on unmount
    }, [userId, db, appId, isAuthReady, setUserProfile, showMessage, today]);


    const handleHighFive = async () => {
        if (!userProfile || loading) return;

        setLoading(true);
        try {
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/userData/profile`);
            const leaderboardDocRef = doc(db, `artifacts/${appId}/public/data/leaderboard/${userId}`);

            const newHighFivesToday = userProfile.highFivesToday + 1;
            const newTotalHighFives = userProfile.totalHighFives + 1;
            const newPoints = userProfile.points + 10; // 10 points per high five

            await updateDoc(userDocRef, {
                highFivesToday: newHighFivesToday,
                totalHighFives: newTotalHighFives,
                points: newPoints,
                lastHighFiveDate: today // Ensure date is updated with each high five
            });

            // Update public leaderboard
            await updateDoc(leaderboardDocRef, {
                totalHighFives: newTotalHighFives
            });

            showMessage(`High Five! You earned 10 points! Total points: ${newPoints}`, 'success');
        } catch (error) {
            console.error("Error giving high five:", error);
            showMessage("Failed to record high five.", 'error');
        } finally {
            setLoading(false);
        }
    };

    if (loading || !userProfile) {
        return (
            <div className="flex justify-center items-center h-screen bg-gray-100">
                <div className="text-xl text-gray-700">Loading user data...</div>
            </div>
        );
    }

    const profileImageSrc = `https://placehold.co/100x100/A78BFA/FFFFFF?text=${userProfile.profileImage.replace('dig-cat-', 'Cat')}`; // Placeholder for now

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg text-center flex flex-col items-center justify-center max-w-lg w-full mx-auto my-8">
            <h1 className="text-4xl font-extrabold text-indigo-700 mb-6">
                Welcome, {userProfile.username}!
            </h1>
            <div className="mb-6 flex flex-col items-center">
                <img
                    src={profileImageSrc}
                    alt="Profile"
                    className="w-24 h-24 rounded-full border-4 border-purple-500 mb-2"
                />
                <p className="text-xl font-semibold text-gray-700">Points: <span className="text-green-600">{userProfile.points}</span></p>
            </div>

            <p className="text-2xl font-bold text-gray-800 mb-4">
                High Fives Today: <span className="text-green-600">{userProfile.highFivesToday}</span>
            </p>
            <p className="text-xl font-semibold text-gray-700 mb-8">
                Total High Fives: <span className="text-blue-600">{userProfile.totalHighFives}</span>
            </p>
            <button
                onClick={handleHighFive}
                className="bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-bold py-4 px-8 rounded-full shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-300 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
            >
                {loading ? 'High Fiving...' : 'Give a High Five! 👋'}
            </button>
        </div>
    );
};

// Leaderboard Component
const Leaderboard = () => {
    const { db, appId, isAuthReady, showMessage } = React.useContext(AppContext);
    const [leaderboard, setLeaderboard] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!isAuthReady) return;

        const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboard`);

        const unsubscribe = onSnapshot(leaderboardCollectionRef, (snapshot) => {
            const usersData = [];
            snapshot.forEach(doc => {
                usersData.push({ id: doc.id, ...doc.data() });
            });

            // Sort client-side by totalHighFives in descending order
            usersData.sort((a, b) => b.totalHighFives - a.totalHighFives);

            setLeaderboard(usersData.slice(0, 15)); // Get top 15
            setLoading(false);
        }, (error) => {
            console.error("Error fetching leaderboard:", error);
            showMessage("Failed to load leaderboard.", 'error');
            setLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener
    }, [db, appId, isAuthReady, showMessage]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm mx-auto my-8">
            <h2 className="text-3xl font-extrabold text-blue-700 mb-6 text-center">Top 15 High Fivers</h2>
            {loading ? (
                <p className="text-center text-gray-600">Loading leaderboard...</p>
            ) : leaderboard.length === 0 ? (
                <p className="text-center text-gray-600">No high fivers yet!</p>
            ) : (
                <ul className="space-y-3">
                    {leaderboard.map((user, index) => (
                        <li key={user.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm">
                            <span className="font-bold text-gray-800">#{index + 1} {user.username}</span>
                            <span className="text-lg font-semibold text-indigo-600">{user.totalHighFives} High Fives</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// Profile Customization Component
const ProfileCustomization = () => {
    const { db, userId, appId, userProfile, setUserProfile, showMessage } = React.useContext(AppContext);
    const [loading, setLoading] = React.useState(false);

    const profileOptions = [
        { id: 'dig-cat-1', name: 'Original Cat', cost: 0, image: 'https://placehold.co/100x100/A78BFA/FFFFFF?text=Cat1' },
        { id: 'dig-cat-2', name: 'Space Cat', cost: 50, image: 'https://placehold.co/100x100/8B5CF6/FFFFFF?text=Cat2' },
        { id: 'dig-cat-3', name: 'Robo Cat', cost: 100, image: 'https://placehold.co/100x100/6D28D9/FFFFFF?text=Cat3' },
        { id: 'dig-cat-4', name: 'Pixel Cat', cost: 200, image: 'https://placehold.co/100x100/4C1D95/FFFFFF?text=Cat4' },
    ];

    const handleSelectProfile = async (option) => {
        if (!userProfile || loading) return;

        if (userProfile.profileImage === option.id) {
            showMessage("This is already your current profile image!", 'info');
            return;
        }

        if (userProfile.points < option.cost) {
            showMessage(`Not enough points! You need ${option.cost} points for ${option.name}.`, 'error');
            return;
        }

        setLoading(true);
        try {
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/userData/profile`);
            const newPoints = userProfile.points - option.cost;

            await updateDoc(userDocRef, {
                profileImage: option.id,
                points: newPoints
            });
            showMessage(`You've unlocked and set ${option.name}!`, 'success');
        } catch (error) {
            console.error("Error updating profile image:", error);
            showMessage("Failed to update profile image.", 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!userProfile) {
        return <p className="text-center text-gray-600">Loading profile options...</p>;
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mx-auto my-8">
            <h2 className="text-3xl font-extrabold text-green-700 mb-6 text-center">Customize Your Profile</h2>
            <p className="text-xl font-semibold text-gray-700 mb-4 text-center">Your Points: <span className="text-green-600">{userProfile.points}</span></p>

            <div className="grid grid-cols-2 gap-4">
                {profileOptions.map(option => (
                    <div
                        key={option.id}
                        className={`border-2 p-4 rounded-lg flex flex-col items-center cursor-pointer transition duration-200
                            ${userProfile.profileImage === option.id ? 'border-purple-500 ring-4 ring-purple-300' : 'border-gray-200 hover:border-gray-400'}
                            ${userProfile.points < option.cost && userProfile.profileImage !== option.id ? 'opacity-60 cursor-not-allowed' : ''}
                        `}
                        onClick={() => handleSelectProfile(option)}
                    >
                        <img src={option.image} alt={option.name} className="w-20 h-20 rounded-full mb-2" />
                        <p className="font-semibold text-gray-800 text-center">{option.name}</p>
                        <p className="text-sm text-gray-600">Cost: <span className="font-bold text-yellow-600">{option.cost}</span> points</p>
                        {userProfile.profileImage === option.id && (
                            <span className="text-sm text-purple-600 font-bold mt-1">Current</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Main App Component
const App = () => {
    // Firebase config from Canvas environment or default for local testing
    const firebaseConfig = JSON.parse(window.__firebase_config);
    const initialAuthToken = window.__initial_auth_token;

    const [app, setApp] = React.useState(null);
    const [db, setDb] = React.useState(null);
    const [auth, setAuth] = React.useState(null);
    const [userId, setUserId] = React.useState(null);
    const [isAuthReady, setIsAuthReady] = React.useState(false); // Tracks if onAuthStateChanged has completed
    const [userProfile, setUserProfile] = React.useState(null);
    const [activeTab, setActiveTab] = React.useState('tracker'); // 'tracker', 'leaderboard', 'customize'

    // Message box state
    const [message, setMessage] = React.useState('');
    const [messageType, setMessageType] = React.useState('info');

    const showMessage = React.useCallback((msg, type = 'info') => {
        setMessage(msg);
        setMessageType(type);
    }, []);

    // Initialize Firebase and set up auth listener
    React.useEffect(() => {
        try {
            const firebaseApp = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(firebaseApp);
            const firebaseAuth = getAuth(firebaseApp);

            setApp(firebaseApp);
            setDb(firestoreDb);
            setAuth(firebaseAuth);

            // Sign in with custom token if available, otherwise anonymously
            const initialAuth = async () => {
                if (initialAuthToken) {
                    try {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                    } catch (error) {
                        console.error("Error signing in with custom token:", error);
                        // Fallback to anonymous if custom token fails
                        await signInAnonymously(firebaseAuth);
                    }
                } else {
                    await signInAnonymously(firebaseAuth);
                }
            };
            initialAuth();

            // Set up auth state change listener
            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // This case should ideally not be hit with anonymous sign-in always active
                    setUserId(null);
                }
                setIsAuthReady(true); // Auth state is now known
            });

            return () => unsubscribe(); // Clean up auth listener
        } catch (error) {
            console.error("Firebase initialization error:", error);
            showMessage("Failed to initialize Firebase. Check your configuration.", 'error');
        }
    }, [firebaseConfig, showMessage, initialAuthToken]);

    // Provide context values
    const contextValue = {
        app, db, auth, userId, setUserId, isAuthReady, setIsAuthReady, appId, userProfile, setUserProfile, showMessage
    };

    if (!isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                <div className="text-white text-2xl animate-pulse">Initializing application...</div>
            </div>
        );
    }

    return (
        <AppContext.Provider value={contextValue}>
            <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center p-4">
                <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-4 mb-6 flex justify-center space-x-4">
                    <button
                        onClick={() => setActiveTab('tracker')}
                        className={`py-2 px-4 rounded-lg font-semibold transition duration-200
                            ${activeTab === 'tracker' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    >
                        My High Fives
                    </button>
                    <button
                        onClick={() => setActiveTab('leaderboard')}
                        className={`py-2 px-4 rounded-lg font-semibold transition duration-200
                            ${activeTab === 'leaderboard' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    >
                        Leaderboard
                    </button>
                    <button
                        onClick={() => setActiveTab('customize')}
                        className={`py-2 px-4 rounded-lg font-semibold transition duration-200
                            ${activeTab === 'customize' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    >
                        Customize Profile
                    </button>
                </div>

                <div className="w-full max-w-4xl flex flex-col md:flex-row md:space-x-4 justify-center items-start">
                    <div className="w-full md:w-1/2 flex justify-center mb-6 md:mb-0">
                        {activeTab === 'tracker' && <HighFiveTracker />}
                        {activeTab === 'customize' && <ProfileCustomization />}
                    </div>
                    <div className="w-full md:w-1/2 flex justify-center">
                        {activeTab === 'leaderboard' && <Leaderboard />}
                        {/* Always show leaderboard if not on a specific tab, or if space allows */}
                        {activeTab !== 'leaderboard' && <Leaderboard />}
                    </div>
                </div>
                <MessageBox
                    message={message}
                    type={messageType}
                    onClose={() => setMessage('')}
                />
            </div>
        </AppContext.Provider>
    );
};

// Render the App component into the root element
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
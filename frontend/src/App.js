import React, { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(response.data);
    } catch (error) {
      console.log("Not authenticated");
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    const redirectUrl = encodeURIComponent(window.location.origin);
    window.location.href = `https://auth.emergentagent.com/?redirect=${redirectUrl}`;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      setUser(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const value = {
    user,
    setUser,
    login,
    logout,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/" />;
};

// Navigation Component
const Navigation = () => {
  const { user, logout } = useAuth();
  
  if (!user) return null;
  
  return (
    <nav className="bg-red-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <Link to="/dashboard" className="text-xl font-bold">
            🩸 BloodConnect
          </Link>
          
          <div className="flex items-center space-x-6">
            <Link to="/dashboard" className="hover:text-red-200">Dashboard</Link>
            {user.user_type === 'requester' && (
              <Link to="/create-request" className="hover:text-red-200">Create Request</Link>
            )}
            <Link to="/requests" className="hover:text-red-200">Browse Requests</Link>
            <Link to="/profile" className="hover:text-red-200">Profile</Link>
            <button 
              onClick={logout}
              className="bg-red-700 hover:bg-red-800 px-3 py-1 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

// Landing Page
const Landing = () => {
  const { login } = useAuth();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-red-600 mb-6">
            🩸 BloodConnect
          </h1>
          <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
            Connecting blood donors with people in need. Save lives through community-driven blood donation coordination.
          </p>
          <button
            onClick={login}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg text-lg font-semibold shadow-lg transform hover:scale-105 transition-all"
          >
            Get Started - Sign In
          </button>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <div className="text-4xl mb-4">🆘</div>
            <h3 className="text-xl font-bold text-gray-800 mb-3">Request Blood</h3>
            <p className="text-gray-600">
              Post urgent blood requests with hospital details and connect with nearby donors instantly.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <div className="text-4xl mb-4">🤝</div>
            <h3 className="text-xl font-bold text-gray-800 mb-3">Donate Blood</h3>
            <p className="text-gray-600">
              Browse blood requests in your city and respond to help save lives in your community.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <div className="text-4xl mb-4">🏥</div>
            <h3 className="text-xl font-bold text-gray-800 mb-3">NGO Support</h3>
            <p className="text-gray-600">
              Organizations can coordinate between donors and recipients for efficient blood donation drives.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Profile Handler (for auth redirect)
const ProfileHandler = () => {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleAuthRedirect = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch) {
        const sessionId = sessionIdMatch[1];
        
        try {
          // Call backend to process the session
          const response = await axios.get(`${API}/auth/profile?session_id=${sessionId}`);
          
          // Set session cookie
          await axios.post(`${API}/auth/set-session`, {
            session_token: response.data.session_token
          }, { withCredentials: true });
          
          setUser(response.data.user);
          navigate('/dashboard');
        } catch (error) {
          console.error('Auth processing failed:', error);
          navigate('/');
        }
      } else {
        navigate('/');
      }
    };

    handleAuthRedirect();
  }, [location, setUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 mx-auto mb-4"></div>
        <p className="text-lg">Processing authentication...</p>
      </div>
    </div>
  );
};

// Dashboard Component
const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [recentRequests, setRecentRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchRecentRequests();
    if (user?.user_type === 'requester') {
      fetchMyRequests();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchRecentRequests = async () => {
    try {
      const response = await axios.get(`${API}/requests?city=${user?.city}`);
      setRecentRequests(response.data.slice(0, 5));
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const fetchMyRequests = async () => {
    try {
      const response = await axios.get(`${API}/requests/my`, { withCredentials: true });
      setMyRequests(response.data.slice(0, 3));
    } catch (error) {
      console.error('Error fetching my requests:', error);
    }
  };

  if (!user.city || user.city === 'Unknown') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-8">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">
            Complete Your Profile
          </h2>
          <p className="text-yellow-700 mb-4">
            Please complete your profile to start using BloodConnect effectively.
          </p>
          <Link
            to="/profile"
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded"
          >
            Update Profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Welcome back, {user.name}!
        </h1>
        <p className="text-gray-600">
          You're making a difference as a {user.user_type} in {user.city}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center">
            <div className="text-3xl text-red-600 mr-4">📊</div>
            <div>
              <p className="text-sm text-gray-600">Total Requests</p>
              <p className="text-2xl font-bold">{stats.total_requests || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center">
            <div className="text-3xl text-green-600 mr-4">🆘</div>
            <div>
              <p className="text-sm text-gray-600">Active Requests</p>
              <p className="text-2xl font-bold">{stats.active_requests || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center">
            <div className="text-3xl text-blue-600 mr-4">🤝</div>
            <div>
              <p className="text-sm text-gray-600">Total Responses</p>
              <p className="text-2xl font-bold">{stats.total_responses || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center">
            <div className="text-3xl text-purple-600 mr-4">👥</div>
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-2xl font-bold">{stats.total_users || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Requests in Your City */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold mb-4">Recent Requests in {user.city}</h2>
          {recentRequests.length > 0 ? (
            <div className="space-y-4">
              {recentRequests.map(request => (
                <div key={request.id} className="border-l-4 border-red-500 pl-4 py-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{request.patient_name}</h3>
                      <p className="text-sm text-gray-600">{request.hospital_name}</p>
                      <p className="text-sm text-gray-500">
                        {request.units_needed} units needed • {request.urgency}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded ${
                      request.urgency === 'critical' ? 'bg-red-100 text-red-800' :
                      request.urgency === 'urgent' ? 'bg-orange-100 text-orange-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {request.urgency}
                    </span>
                  </div>
                </div>
              ))}
              <Link
                to="/requests"
                className="block text-center bg-red-600 hover:bg-red-700 text-white py-2 rounded mt-4"
              >
                View All Requests
              </Link>
            </div>
          ) : (
            <p className="text-gray-500">No recent requests in your city.</p>
          )}
        </div>

        {/* My Recent Requests (for requesters) */}
        {user.user_type === 'requester' && (
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">My Recent Requests</h2>
            {myRequests.length > 0 ? (
              <div className="space-y-4">
                {myRequests.map(request => (
                  <div key={request.id} className="border-l-4 border-blue-500 pl-4 py-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{request.patient_name}</h3>
                        <p className="text-sm text-gray-600">{request.hospital_name}</p>
                        <p className="text-sm text-gray-500">
                          {request.responses_count} responses
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${
                        request.status === 'active' ? 'bg-green-100 text-green-800' :
                        request.status === 'fulfilled' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {request.status}
                      </span>
                    </div>
                  </div>
                ))}
                <Link
                  to="/create-request"
                  className="block text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded mt-4"
                >
                  Create New Request
                </Link>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">You haven't created any requests yet.</p>
                <Link
                  to="/create-request"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
                >
                  Create Your First Request
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions for Donors */}
        {user.user_type === 'donor' && (
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
            <div className="space-y-4">
              <Link
                to="/requests"
                className="block bg-red-600 hover:bg-red-700 text-white text-center py-3 rounded-lg"
              >
                🔍 Browse Blood Requests
              </Link>
              <Link
                to="/profile"
                className="block bg-blue-600 hover:bg-blue-700 text-white text-center py-3 rounded-lg"
              >
                📝 Update Profile
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Profile Component
const Profile = () => {
  const { user, setUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    user_type: '',
    city: '',
    phone: '',
    emergency_contact: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        user_type: user.user_type || '',
        city: user.city || '',
        phone: user.phone || '',
        emergency_contact: user.emergency_contact || ''
      });
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const response = await axios.put(`${API}/auth/profile`, formData, { withCredentials: true });
      setUser(response.data);
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Error updating profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Profile Settings</h1>
        
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User Type
              </label>
              <select
                name="user_type"
                value={formData.user_type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              >
                <option value="">Select user type</option>
                <option value="donor">Blood Donor</option>
                <option value="requester">Blood Requester</option>
                <option value="ngo">NGO/Organization</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
                placeholder="e.g., Mumbai, Delhi, Bangalore"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Your contact number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Emergency Contact
              </label>
              <input
                type="tel"
                name="emergency_contact"
                value={formData.emergency_contact}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Emergency contact number"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-md font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// Create Request Component
const CreateRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    patient_name: '',
    blood_group: '',
    units_needed: 1,
    hospital_name: '',
    hospital_address: '',
    city: user?.city || '',
    urgency: 'normal',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await axios.post(`${API}/requests`, formData, { withCredentials: true });
      alert('Blood request created successfully!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Error creating request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Create Blood Request</h1>
        
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Patient Name *
              </label>
              <input
                type="text"
                name="patient_name"
                value={formData.patient_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Blood Group (Optional)
                </label>
                <select
                  name="blood_group"
                  value={formData.blood_group}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select if known</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Units Needed *
                </label>
                <input
                  type="number"
                  name="units_needed"
                  value={formData.units_needed}
                  onChange={handleChange}
                  min="1"
                  max="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hospital Name *
              </label>
              <input
                type="text"
                name="hospital_name"
                value={formData.hospital_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hospital Address *
              </label>
              <textarea
                name="hospital_address"
                value={formData.hospital_address}
                onChange={handleChange}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              ></textarea>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City *
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Urgency *
                </label>
                <select
                  name="urgency"
                  value={formData.urgency}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Information
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Any additional details about the request..."
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-md font-semibold disabled:opacity-50"
            >
              {submitting ? 'Creating Request...' : 'Create Blood Request'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// Browse Requests Component
const BrowseRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    city: user?.city || '',
    urgency: ''
  });

  useEffect(() => {
    fetchRequests();
  }, [filters]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.city) params.append('city', filters.city);
      if (filters.urgency) params.append('urgency', filters.urgency);
      
      const response = await axios.get(`${API}/requests?${params}`);
      setRequests(response.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (requestId) => {
    const message = prompt('Please enter your message to the requester:');
    if (!message) return;

    try {
      await axios.post(`${API}/responses`, {
        request_id: requestId,
        message: message
      }, { withCredentials: true });
      
      alert('Response sent successfully!');
      fetchRequests(); // Refresh to update response count
    } catch (error) {
      console.error('Error sending response:', error);
      if (error.response?.status === 400) {
        alert('You have already responded to this request.');
      } else {
        alert('Error sending response. Please try again.');
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Browse Blood Requests</h1>
        
        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by City
              </label>
              <input
                type="text"
                value={filters.city}
                onChange={(e) => setFilters({...filters, city: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter city name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Urgency
              </label>
              <select
                value={filters.urgency}
                onChange={(e) => setFilters({...filters, urgency: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">All urgency levels</option>
                <option value="critical">Critical</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 mx-auto"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {requests.length > 0 ? (
            requests.map(request => (
              <div key={request.id} className="bg-white p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      Blood needed for {request.patient_name}
                    </h3>
                    <p className="text-gray-600">
                      Posted by {request.requester_name} • {formatDate(request.created_at)}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    request.urgency === 'critical' ? 'bg-red-100 text-red-800' :
                    request.urgency === 'urgent' ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {request.urgency.toUpperCase()}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-4">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Request Details</h4>
                    <div className="space-y-1 text-sm">
                      {request.blood_group && (
                        <p><span className="font-medium">Blood Group:</span> {request.blood_group}</p>
                      )}
                      <p><span className="font-medium">Units Needed:</span> {request.units_needed}</p>
                      <p><span className="font-medium">City:</span> {request.city}</p>
                      <p><span className="font-medium">Responses:</span> {request.responses_count}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Hospital Details</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Hospital:</span> {request.hospital_name}</p>
                      <p><span className="font-medium">Address:</span> {request.hospital_address}</p>
                    </div>
                  </div>
                </div>

                {request.description && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-700 mb-2">Additional Information</h4>
                    <p className="text-gray-600 text-sm">{request.description}</p>
                  </div>
                )}

                {user?.user_type === 'donor' && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleRespond(request.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md font-semibold"
                    >
                      🤝 Respond to Help
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No requests found</h3>
              <p className="text-gray-500">
                Try adjusting your filters or check back later for new requests.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/profile" element={<ProfileHandler />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/profile-settings" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/create-request" element={
              <ProtectedRoute>
                <CreateRequest />
              </ProtectedRoute>
            } />
            <Route path="/requests" element={
              <ProtectedRoute>
                <BrowseRequests />
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
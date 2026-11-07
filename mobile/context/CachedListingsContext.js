import React, { createContext, useContext, useState } from 'react';

const CachedListingsContext = createContext();

export const CachedListingsProvider = ({ children }) => {
  const [cache, setCache] = useState({});

  const updateCache = (listing) => {
    if (!listing || !listing.id) return;
    setCache(prev => ({
      ...prev,
      [listing.id]: listing
    }));
  };

  const getCached = (id) => cache[id] || null;

  return (
    <CachedListingsContext.Provider value={{ cache, updateCache, getCached }}>
      {children}
    </CachedListingsContext.Provider>
  );
};

export const useCachedListings = () => useContext(CachedListingsContext);
// context/FiltersContext.js
import React, { createContext, useState, useContext } from 'react';

const FiltersContext = createContext();

export function FiltersProvider({ children }) {
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    categoryName: '',
    regionId: '',
    regionName: '',
    cityId: '',
    cityName: '',
    priceFrom: '',
    priceTo: '',
    type: 'sell',
    sort: 'date_desc',
  });

  return (
    <FiltersContext.Provider value={{ filters, setFilters }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  return useContext(FiltersContext);
}
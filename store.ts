import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Stock {
  symbol: string;
  price: number;
  changePercent: number;
}

interface Order {
  symbol: string;
  quantity: number;
  action: "buy" | "sell";
  price: number;
}

interface StoreState {
  stocks: Stock[];
  orders: Order[];
  profitLoss: { [key: string]: number };
  buyQuantities: { [key: string]: number };
  sellQuantities: { [key: string]: number };
  stopLossPrices: { [key: string]: number };
  setStocks: (stocks: Stock[]) => void;
  addOrder: (order: Order) => void;
  setProfitLoss: (symbol: string, value: number) => void;
  setBuyQuantities: (symbol: string, quantity: number) => void;
  setSellQuantities: (symbol: string, quantity: number) => void;
  setStopLossPrices: (symbol: string, price: number) => void;
}

export const useStore = create<StoreState>(
  persist(
    (set) => ({
      stocks: [],
      orders: [],
      profitLoss: {},
      buyQuantities: {},
      sellQuantities: {},
      stopLossPrices: {},
      setStocks: (stocks) => set({ stocks }),
      addOrder: (order) =>
        set((state) => ({ orders: [...state.orders, order] })),
      setProfitLoss: (symbol, value) =>
        set((state) => ({
          profitLoss: { ...state.profitLoss, [symbol]: value },
        })),
      setBuyQuantities: (symbol, quantity) =>
        set((state) => ({
          buyQuantities: { ...state.buyQuantities, [symbol]: quantity },
        })),
      setSellQuantities: (symbol, quantity) =>
        set((state) => ({
          sellQuantities: { ...state.sellQuantities, [symbol]: quantity },
        })),
      setStopLossPrices: (symbol, price) =>
        set((state) => ({
          stopLossPrices: { ...state.stopLossPrices, [symbol]: price },
        })),
    }),
    {
      name: "stock-market-storage", // name of the item in the storage (must be unique)
    }
  )
);

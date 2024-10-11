"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { FaSpinner } from "react-icons/fa";

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

export default function StockMarket() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [profitLoss, setProfitLoss] = useState<{ [key: string]: number }>({});
  const [buyQuantities, setBuyQuantities] = useState<{ [key: string]: number }>(
    {}
  );
  const [sellQuantities, setSellQuantities] = useState<{
    [key: string]: number;
  }>({});
  const [stopLossPrices, setStopLossPrices] = useState<{
    [key: string]: number;
  }>({});
  const [cash, setCash] = useState<number>(100000);
  const [loading, setLoading] = useState<boolean>(false);
  const [portfolioValue, setPortfolioValue] = useState<number>(0);

  const API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

  useEffect(() => {
    const fetchStocks = async () => {
      setLoading(true);
      try {
        const symbols = ["AAPL", "GOOGL", "AMZN", "MSFT", "TSLA"];
        const stockData = await Promise.all(
          symbols.map(async (symbol) => {
            const response = await axios.get(
              `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`
            );
            const currentPrice = response.data.c;
            const previousClose = response.data.pc;
            const changePercent =
              ((currentPrice - previousClose) / previousClose) * 100;
            return { symbol, price: currentPrice, changePercent };
          })
        );
        setStocks(stockData);
        // console.log('stockData =>', stockData);
      } catch (error) {
        console.error("Error fetching stock data =>", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStocks();
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${API_KEY}`);

    ws.onopen = () => {
      // console.log("WebSocket connection established");
      const symbols = ["AAPL", "GOOGL", "AMZN", "MSFT", "TSLA"];
      symbols.forEach((symbol) => {
        ws.send(JSON.stringify({ type: "subscribe", symbol }));
      });
    };

    // ws.onerror = (error) => {
    //   console.error("WebSocket error =>", error);
    // };

    // ws.onclose = (event) => {
    //   console.log("WebSocket connection closed =>", event);
    // };

    let debounceTimeout: NodeJS.Timeout;
    const debounceUpdate = (updatedStocks: any[]) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        setStocks((prevStocks) =>
          prevStocks.map((stock) => {
            const updatedStock = updatedStocks.find(
              (updated) => updated.symbol === stock.symbol
            );
            if (updatedStock) {
              const changePercent =
                ((updatedStock.price - stock.price) / stock.price) * 100;
              return { ...stock, price: updatedStock.price, changePercent };
            }
            return stock;
          })
        );
      }, 200);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "trade") {
        const updatedStocks = data.data.map((trade: any) => ({
          symbol: trade.s,
          price: trade.p,
        }));
        debounceUpdate(updatedStocks);
      }
    };

    return () => {
      ws.close();
    };
  }, [API_KEY]);

  useEffect(() => {
    const value = calculatePortfolioValue();
    setPortfolioValue(value + cash); // รวมมูลค่าหุ้นในพอร์ตกับเงินสด
  }, [stocks, orders, cash]);

  const calculatePortfolioValue = () => {
    const holdings = calculateHoldings();
    return Object.entries(holdings).reduce((total, [symbol, quantity]) => {
      const stock = stocks.find((s) => s.symbol === symbol);
      return total + (stock ? stock.price * quantity : 0);
    }, 0);
  };

  const handleBuy = (symbol: string) => {
    const stock = stocks.find((s) => s.symbol === symbol);
    if (stock) {
      const quantity = buyQuantities[symbol] || 1;
      const totalCost = stock.price * quantity;
      if (cash >= totalCost) {
        const order: Order = {
          symbol,
          quantity,
          action: "buy",
          price: stock.price,
        };
        setOrders((prev) => [...prev, order]);
        setCash((prev) => prev - totalCost);
        calculateProfitLoss(symbol, quantity, stock.price, "buy");
        Swal.fire("สำเร็จ", "ซื้อหุ้นสำเร็จ!", "success");
        // เคลียร์ค่า buyQuantities สำหรับสัญลักษณ์ที่ซื้อ
        setBuyQuantities((prev) => ({ ...prev, [symbol]: "" }));
      } else {
        Swal.fire("ข้อผิดพลาด", "เงินในพอร์ตไม่เพียงพอสำหรับการซื้อ", "error");
      }
    }
  };

  const handleSell = (symbol: string) => {
    const stock = stocks.find((s) => s.symbol === symbol);
    if (stock) {
      const holdings = calculateHoldings();
      const quantityToSell = sellQuantities[symbol] || 1;

      if (quantityToSell > holdings[symbol]) {
        Swal.fire(
          "ข้อผิดพลาด",
          `คุณมีหุ้น ${symbol} ไม่เพียงพอที่จะขาย`,
          "error"
        );
        return;
      }

      if (holdings[symbol] >= quantityToSell) {
        const order: Order = {
          symbol,
          quantity: quantityToSell,
          action: "sell",
          price: stock.price,
        };
        setOrders((prev) => [...prev, order]);
        setCash((prev) => prev + stock.price * quantityToSell);
        calculateProfitLoss(symbol, quantityToSell, stock.price, "sell");

        // เคลียร์ค่า sellQuantities และ input field สำหรับสัญลักษณ์ที่ขาย
        setSellQuantities((prev) => ({ ...prev, [symbol]: "" }));

        if (holdings[symbol] === quantityToSell) {
          setBuyQuantities((prev) => ({ ...prev, [symbol]: 0 }));
          setSellQuantities((prev) => ({ ...prev, [symbol]: 0 }));
          setStopLossPrices((prev) => {
            const updated = { ...prev };
            delete updated[symbol];
            return updated;
          });
        }

        Swal.fire("สำเร็จ", "ขายหุ้นสำเร็จ!", "success");
      } else {
        Swal.fire(
          "ข้อผิดพลาด",
          `คุณมีหุ้น ${symbol} ไม่เพียงพอที่จะขาย`,
          "error"
        );
      }
    }
  };

  const calculateProfitLoss = (
    symbol: string,
    quantity: number,
    price: number,
    action: string
  ) => {
    const currentPL = profitLoss[symbol] || 0;
    const transactionValue = price * quantity;
    const newPL =
      action === "buy"
        ? currentPL - transactionValue
        : currentPL + transactionValue;
    setProfitLoss((prev) => ({ ...prev, [symbol]: newPL }));
  };

  const handleStopLoss = (symbol: string, stopLossPrice: number) => {
    setStopLossPrices((prev) => ({ ...prev, [symbol]: stopLossPrice }));
  };

  useEffect(() => {
    stocks.forEach((stock) => {
      const stopLossPrice = stopLossPrices[stock.symbol];
      if (stopLossPrice && stock.price <= stopLossPrice) {
        handleSell(stock.symbol);
      }
    });
  }, [stocks, stopLossPrices]);

  const calculateHoldings = () => {
    const holdings: { [key: string]: number } = {};
    orders.forEach((order) => {
      if (!holdings[order.symbol]) {
        holdings[order.symbol] = 0;
      }
      holdings[order.symbol] +=
        order.action === "buy" ? order.quantity : -order.quantity;
    });
    return holdings;
  };

  const clearAllValues = () => {
    setOrders([]);
    setProfitLoss({});
    setBuyQuantities({});
    setSellQuantities({});
    setStopLossPrices({});
    setCash(100000); // Reset to initial cash amount
  };

  const holdings = calculateHoldings();

  return (
    <div className="container mx-auto p-4 mt-10 shadow-lg ">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">ตลาดหุ้น</h1>
        <button
          onClick={clearAllValues}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          ล้างค่าทั้งหมด
        </button>
      </div>
      <div className="mb-4">
        <h2 className="text-xl font-bold">
          เงินในพอร์ต: ${cash.toFixed(2)}USD
        </h2>
      </div>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <FaSpinner className="animate-spin text-4xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stocks.map((stock) => (
            <div key={stock.symbol} className="border p-4 rounded shadow">
              <h2 className="text-xl font-semibold">
                {stock.symbol}: ${stock.price.toFixed(2)}{" "}
                <span
                  className={
                    stock.changePercent >= 0 ? "text-green-500" : "text-red-500"
                  }
                >
                  ({stock.changePercent.toFixed(2)}%)
                </span>
              </h2>
              <div className="flex items-center space-x-2 mt-2">
                <input
                  type="number"
                  value={buyQuantities[stock.symbol] || 0}
                  onChange={(e) =>
                    setBuyQuantities((prev) => ({
                      ...prev,
                      [stock.symbol]: Number(e.target.value),
                    }))
                  }
                  min="0"
                  className="border rounded p-2 w-20"
                />
                <button
                  onClick={() => handleBuy(stock.symbol)}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  ซื้อ
                </button>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <input
                  type="number"
                  value={sellQuantities[stock.symbol] || 0}
                  onChange={(e) =>
                    setSellQuantities((prev) => ({
                      ...prev,
                      [stock.symbol]: Number(e.target.value),
                    }))
                  }
                  min="0"
                  className="border rounded p-2 w-20"
                />
                <button
                  onClick={() => handleSell(stock.symbol)}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                >
                  ขาย
                </button>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <input
                  type="number"
                  value={stopLossPrices[stock.symbol] || ""}
                  onChange={(e) =>
                    handleStopLoss(stock.symbol, Number(e.target.value))
                  }
                  min="0"
                  placeholder="Stop Loss"
                  className="border rounded p-2 w-20"
                  style={{ width: "100px" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-2xl font-bold mt-6">คำสั่งซื้อ/ขาย</h2>
      <ul className="list-disc pl-5">
        {orders.map((order, index) => (
          <li
            key={index}
            className={`mt-2 ${
              order.action === "buy" ? "text-green-500" : "text-red-500"
            }`}
          >
            {order.action} {order.quantity} USD <strong>{order.symbol}</strong>{" "}
            ที่ ${order.price !== undefined ? order.price.toFixed(2) : "N/A"}
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-bold mt-6">กำไร/ขาดทุน</h2>
      <ul className="list-disc pl-5">
        {Object.entries(profitLoss).map(([symbol, pl], index) => (
          <li
            key={index}
            className={pl >= 0 ? "text-green-500" : "text-red-500"}
          >
            {symbol}: ${pl.toFixed(2)}
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-bold mt-6">พอร์ตหุ้น</h2>
      <ul className="list-disc pl-5">
        {Object.entries(holdings).map(([symbol, quantity], index) => (
          <li key={index}>
            {symbol}: {quantity} หุ้น
          </li>
        ))}
      </ul>
      <h2 className="text-2xl font-bold mt-6"> มูลค่าพอร์ตหุ้นรวม</h2>

      <li>
        มูลค่าพอร์ต:
        <b style={{ fontSize: "19px" }}> ${portfolioValue.toFixed(2)} USD </b>
      </li>
    </div>
  );
}

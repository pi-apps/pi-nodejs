import axios, { AxiosInstance } from "axios";

export const getAxiosClient = (apiKey: string): AxiosInstance => {
  const axiosClient = axios.create({
    baseURL: "https://api.minepi.com",
    timeout: 20000,
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
  });

  return axiosClient;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState } from "react";
import { generateFailedPaymentBatch } from "@/lib/simulation/generate";
import { Payment, Customer, FailureEvent } from "@/lib/types";

export default function AgentPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const testAgent = async () => {
    try {
      setLoading(true);
      setError("");
      
      // Generate synthetic payment
      const batch = generateFailedPaymentBatch(Math.floor(Math.random() * 10000), 1);
      const payment = batch.payments[0];
      const customer = batch.customers[0];
      const failure = batch.failureEvents[0];
      
      // Call agent
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment, customer, failure }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to call agent API");
      }
      
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold font-newsreader">Agent Verification</h1>
      <p className="text-muted-foreground">Minimal view to test the POST /process agent endpoint.</p>
      
      <button 
        onClick={testAgent}
        disabled={loading}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Generate Payment & Test Agent"}
      </button>
      
      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-md">
          {error}
        </div>
      )}
      
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-md">
              <h3 className="font-semibold text-lg mb-2">Diagnosis</h3>
              <p><strong>Permanent:</strong> {result.diagnosis.is_permanent ? "Yes" : "No"}</p>
              <p><strong>Confidence:</strong> {result.diagnosis.confidence}</p>
              <p><strong>Reasoning:</strong> {result.diagnosis.reasoning}</p>
            </div>
            
            <div className="p-4 border rounded-md">
              <h3 className="font-semibold text-lg mb-2">Strategy Decision</h3>
              <p><strong>Probability:</strong> {result.probability}%</p>
              <p><strong>Strategy:</strong> {result.strategy}</p>
              <p><strong>Timing:</strong> {result.retry_timing}</p>
            </div>
          </div>
          
          <div className="p-4 border rounded-md bg-muted/50">
            <h3 className="font-semibold text-lg mb-2">Execution & Stopping</h3>
            <p><strong>Action Result:</strong> {result.action_result?.outcome}</p>
            <p><strong>Stopped:</strong> {result.is_stopped ? "Yes" : "No"}</p>
            <p><strong>Stop Reason:</strong> {result.stop_reason}</p>
          </div>
          
          <div>
            <h3 className="font-semibold text-lg mb-2">Raw Result</h3>
            <pre className="p-4 bg-muted text-sm rounded-md overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

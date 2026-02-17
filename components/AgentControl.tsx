import React, { useState, useEffect } from 'react';
import { orchestrator } from '../services/agentOrchestrator';
import { agentTeam } from '../services/agentTeam';
import { OrchestratorState, AgentRole } from '../types';
import { WORKFLOW_TEMPLATES, listWorkflows } from '../services/agentWorkflows';

const AgentControl: React.FC = () => {
  const [state, setState] = useState<OrchestratorState>(orchestrator.getState());
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');

  useEffect(() => {
    // Initialize agent team on mount
    if (!isInitialized) {
      agentTeam.initialize();
      setIsInitialized(true);
    }

    // Subscribe to orchestrator events
    const listener = (event: string, _data: unknown) => {
      if (import.meta.env.DEV) console.log(`🎭 Event: ${event}`);
      setState(orchestrator.getState());
    };

    orchestrator.on(listener);

    // Update state periodically
    const interval = setInterval(() => {
      setState(orchestrator.getState());
    }, 1000);

    return () => {
      orchestrator.off(listener);
      clearInterval(interval);
    };
  }, [isInitialized]);

  const handleStart = async () => {
    await orchestrator.start();
  };

  const handleStop = async () => {
    await orchestrator.stop();
  };

  const handleReset = () => {
    orchestrator.reset();
    setState(orchestrator.getState());
  };

  const handleExecuteWorkflow = async () => {
    if (!selectedWorkflow) return;

    const workflow = WORKFLOW_TEMPLATES[selectedWorkflow];
    if (workflow) {
      await orchestrator.executeWorkflow(workflow);
    }
  };

  const workflows = listWorkflows();
  const metrics = orchestrator.getMetrics();

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'IDLE': return 'text-green-600';
      case 'BUSY': return 'text-yellow-600';
      case 'ERROR': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTaskStatusBadge = (status: string): string => {
    switch (status) {
      case 'PENDING': return 'bg-gray-200 text-gray-700';
      case 'IN_PROGRESS': return 'bg-blue-200 text-blue-700';
      case 'COMPLETED': return 'bg-green-200 text-green-700';
      case 'FAILED': return 'bg-red-200 text-red-700';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-purple-900 dark:text-purple-300 flex items-center">
              <span className="material-icons-outlined mr-2" aria-hidden="true">psychology</span>
              Multi-Agent System
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              AI 에이전트들이 협업하여 작업을 수행합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              state.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${state.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
              {state.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={state.isActive}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              state.isActive
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105'
            }`}
          >
            <span className="material-icons-outlined text-sm mr-1 align-middle" aria-hidden="true">play_arrow</span>
            Start System
          </button>
          <button
            onClick={handleStop}
            disabled={!state.isActive}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              !state.isActive
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            <span className="material-icons-outlined text-sm mr-1 align-middle" aria-hidden="true">stop</span>
            Stop System
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2 rounded-lg font-medium bg-gray-600 text-white hover:bg-gray-700"
          >
            <span className="material-icons-outlined text-sm mr-1 align-middle" aria-hidden="true">refresh</span>
            Reset
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light dark:border-border-dark">
          <div className="text-sm text-gray-500 mb-1">Total Tasks</div>
          <div className="text-2xl font-bold text-indigo-600">{metrics.totalTasks}</div>
        </div>
        <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light dark:border-border-dark">
          <div className="text-sm text-gray-500 mb-1">Completed</div>
          <div className="text-2xl font-bold text-green-600">{metrics.completedTasks}</div>
        </div>
        <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light dark:border-border-dark">
          <div className="text-sm text-gray-500 mb-1">Failed</div>
          <div className="text-2xl font-bold text-red-600">{metrics.failedTasks}</div>
        </div>
        <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light dark:border-border-dark">
          <div className="text-sm text-gray-500 mb-1">Active Agents</div>
          <div className="text-2xl font-bold text-purple-600">{state.activeAgents.length}</div>
        </div>
      </div>

      {/* Agent Status */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark">
        <h4 className="font-bold mb-4 flex items-center">
          <span className="material-icons-outlined mr-2" aria-hidden="true">groups</span>
          Agent Status
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {metrics.agentStats?.map((agent) => (
            <div key={agent.role} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{agent.role}</span>
                <span className={`text-sm font-medium ${getStatusColor(agent.status)}`}>
                  {agent.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>Tasks: {agent.tasksCompleted}</div>
                <div>Success: {(agent.performance.successRate * 100).toFixed(0)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Execution */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark">
        <h4 className="font-bold mb-4 flex items-center">
          <span className="material-icons-outlined mr-2" aria-hidden="true">account_tree</span>
          Execute Workflow
        </h4>
        <div className="flex gap-3">
          <select
            value={selectedWorkflow}
            onChange={(e) => setSelectedWorkflow(e.target.value)}
            className="flex-1 border rounded p-3 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
          >
            <option value="">Select a workflow...</option>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id.replace('wf_', '')}>
                {wf.name} - {wf.description}
              </option>
            ))}
          </select>
          <button
            onClick={handleExecuteWorkflow}
            disabled={!selectedWorkflow || !state.isActive}
            className={`px-6 py-2 rounded-lg font-medium ${
              !selectedWorkflow || !state.isActive
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            Execute
          </button>
        </div>
      </div>

      {/* Current Workflow */}
      {state.currentWorkflow && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-bold mb-3 flex items-center text-blue-900 dark:text-blue-300">
            <span className="material-icons-outlined mr-2 animate-spin" aria-hidden="true">autorenew</span>
            Current Workflow
          </h4>
          <div className="space-y-2">
            <div className="text-lg font-medium">{state.currentWorkflow.name}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Stage: {state.currentWorkflow.stage}</div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 transition-all duration-500"
                style={{ width: `${state.currentWorkflow.progress}%` }}
              ></div>
            </div>
            <div className="text-sm text-gray-500">{state.currentWorkflow.progress.toFixed(0)}% Complete</div>
          </div>
        </div>
      )}

      {/* Task Queue */}
      {state.taskQueue.length > 0 && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark">
          <h4 className="font-bold mb-4 flex items-center">
            <span className="material-icons-outlined mr-2" aria-hidden="true">list</span>
            Task Queue ({state.taskQueue.length})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {state.taskQueue.slice(-10).reverse().map((task) => (
              <div key={task.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-sm">{task.description}</div>
                  <div className="text-xs text-gray-500">{task.assignedTo} • {task.type}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getTaskStatusBadge(task.status)}`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared Memory */}
      {state.sharedMemory.length > 0 && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark">
          <h4 className="font-bold mb-4 flex items-center">
            <span className="material-icons-outlined mr-2" aria-hidden="true">memory</span>
            Shared Memory ({state.sharedMemory.length})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {state.sharedMemory.slice(-10).reverse().map((mem) => (
              <div key={mem.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-purple-600">{mem.type}</span>
                  <span className="text-xs text-gray-500">by {mem.source}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Tags: {mem.tags.join(', ')} • Relevance: {(mem.relevance * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentControl;

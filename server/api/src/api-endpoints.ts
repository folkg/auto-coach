/**
 * Fantasy AutoCoach API Endpoints Specification
 * 
 * This file documents all the API endpoints implemented in the Hono server.
 * It serves as a central reference for developers working with the API.
 */

// Types from common package
import type { Team } from '@common/src/types/team';
import type { Schedule } from '@common/src/types/schedule';
import type { TransactionsData, PostTransactionsResult } from '@common/src/types/transactions';
import type { FeedbackData } from '@common/src/types/feedback';

/**
 * API Endpoints
 * 
 * Path: The URL path of the endpoint
 * Method: The HTTP method used (GET, POST, PUT, DELETE)
 * Purpose: Description of what the endpoint does
 * Authentication: Whether authentication is required
 * Request: The type of the request payload
 * Response: The type of the response payload
 */
export const API_ENDPOINTS = {
  // Teams endpoints
  TEAMS_GET: {
    path: '/api/teams',
    method: 'GET',
    purpose: 'Fetch authenticated user\'s teams, combining data from Yahoo API and Firestore settings',
    authentication: true,
    request: null,
    response: 'Team[]'
  },
  TEAM_LINEUP_SETTING_UPDATE: {
    path: '/api/teams/:teamKey/lineup/setting',
    method: 'PUT',
    purpose: 'Update the is_setting_lineups boolean for a specific team in Firestore for the authenticated user',
    authentication: true,
    request: '{ value: boolean }',
    response: '{ success: boolean }'
  },
  TEAM_LINEUP_PAUSED_UPDATE: {
    path: '/api/teams/:teamKey/lineup/paused',
    method: 'PUT',
    purpose: 'Update the lineup_paused_at timestamp for a specific team in Firestore for the authenticated user (pause/resume)',
    authentication: true,
    request: '{ value: boolean }',
    response: '{ success: boolean }'
  },

  // Schedules endpoints
  SCHEDULES_GET: {
    path: '/api/schedules',
    method: 'GET',
    purpose: 'Fetch daily game schedule data (from Firestore)',
    authentication: true,
    request: null,
    response: 'Schedule'
  },

  // Transactions endpoints
  TRANSACTIONS_GET: {
    path: '/api/transactions',
    method: 'GET',
    purpose: 'Generate and fetch suggested transactions for the authenticated user',
    authentication: true,
    request: null,
    response: 'TransactionsData'
  },
  TRANSACTIONS_POST: {
    path: '/api/transactions',
    method: 'POST',
    purpose: 'Process selected transactions for the authenticated user with the Yahoo Fantasy API',
    authentication: true,
    request: 'TransactionsData (containing only selected transactions)',
    response: 'PostTransactionsResult'
  },

  // Feedback endpoints
  FEEDBACK_POST: {
    path: '/api/feedback',
    method: 'POST',
    purpose: 'Receive feedback from the authenticated user and send an email',
    authentication: true,
    request: 'FeedbackData',
    response: '{ success: boolean }'
  }
};

/**
 * Type for all API endpoints
 */
export type ApiEndpoints = typeof API_ENDPOINTS;
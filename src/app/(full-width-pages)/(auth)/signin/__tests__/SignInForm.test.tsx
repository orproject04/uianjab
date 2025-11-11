import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignInForm from '../SignInForm';

// Mock modules without external variable references to avoid hoisting issues
jest.mock('@/lib/tokens');
jest.mock('next/navigation');
jest.mock('@/context/MeContext');

describe('SignInForm', () => {
  let mockSetTokens: jest.Mock;
  let mockRouterReplace: jest.Mock;
  let mockRefresh: jest.Mock;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockSetTokens = jest.fn();
    mockRouterReplace = jest.fn();
    mockRefresh = jest.fn(() => Promise.resolve());

    // Apply the mocks
    const tokens = require('@/lib/tokens');
    const navigation = require('next/navigation');
    const meContext = require('@/context/MeContext');

    tokens.setTokens = mockSetTokens;
    navigation.useRouter = jest.fn(() => ({ replace: mockRouterReplace }));
    navigation.useSearchParams = jest.fn(() => new URLSearchParams());
    meContext.useMe = jest.fn(() => ({ refresh: mockRefresh }));

    jest.clearAllMocks();
    // reset fetch mock
    (global.fetch as any) = undefined;
    sessionStorage.clear();
  });

  it('successful login sets tokens, calls refresh and redirects', async () => {
    const fakeResponse = { access_token: 'at', refresh_token: 'rt' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResponse });

    render(<SignInForm />);

    const email = screen.getByPlaceholderText(/nama@instansi.go.id/i);
    const password = screen.getByPlaceholderText(/Enter your password/i);
    const btn = screen.getByRole('button', { name: /masuk|memproses/i });

    fireEvent.change(email, { target: { value: 'user@example.com' } });
    fireEvent.change(password, { target: { value: 'password123' } });

    fireEvent.click(btn);

    await waitFor(() => expect(mockSetTokens).toHaveBeenCalledWith('at', 'rt'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/'));
  });

  it('failed login shows error notice', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid credentials' }) });

    render(<SignInForm />);

    const email = screen.getByPlaceholderText(/nama@instansi.go.id/i);
    const password = screen.getByPlaceholderText(/Enter your password/i);
    const btn = screen.getByRole('button', { name: /masuk|memproses/i });

    fireEvent.change(email, { target: { value: 'user@example.com' } });
    fireEvent.change(password, { target: { value: 'wrong' } });

    fireEvent.click(btn);

    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(/Invalid credentials/);
    });
  });
});

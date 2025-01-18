import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Newsletter from './Newsletter'

describe('Newsletter', () => {
  it('renders newsletter form', () => {
    render(<Newsletter />)
    
    expect(screen.getByText('Newsletter')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument()
    expect(screen.getByText('Subscribe')).toBeInTheDocument()
  })

  it('shows error when submitting empty email', async () => {
    render(<Newsletter />)
    
    fireEvent.click(screen.getByText('Subscribe'))
    
    expect(await screen.findByText('Please enter your email address')).toBeInTheDocument()
  })

  it('handles successful subscription', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ message: 'Subscription successful' }),
    })

    render(<Newsletter />)
    
    const emailInput = screen.getByPlaceholderText('Enter your email')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByText('Subscribe'))
    
    await waitFor(() => {
      expect(screen.getByText('Subscription successful')).toBeInTheDocument()
    })
  })

  it('handles subscription error', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

    render(<Newsletter />)
    
    const emailInput = screen.getByPlaceholderText('Enter your email')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByText('Subscribe'))
    
    await waitFor(() => {
      expect(screen.getByText('An error occurred. Please try again later.')).toBeInTheDocument()
    })
  })
}) 
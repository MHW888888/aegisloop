#!/usr/bin/env python3
"""
Generate sanitized screenshots for AegisLoop thread states.

This script creates visual documentation for the 'Needs approval' and 'Frozen'
thread states, showing when automation is intentionally paused and why that is safe.

Usage:
    python scripts/generate_screenshots.py [--output-dir OUTPUT_DIR]

Requirements:
    - playwright (pip install playwright)
    - Run: playwright install chromium
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any

from playwright.sync_api import sync_playwright, Page, Browser

# Constants
DEFAULT_OUTPUT_DIR = "docs/screenshots"
BASE_URL = "http://localhost:3000"  # Adjust to your dev server URL

# Sample thread data for each state
THREAD_STATES = {
    "needs_approval": {
        "title": "Needs Approval - Thread Pending Review",
        "description": "This thread requires human approval before automation can proceed. Automation is intentionally paused to ensure safety and correctness.",
        "state": "needs_approval",
        "messages": [
            {
                "role": "user",
                "content": "Please review my proposed changes to the authentication module."
            },
            {
                "role": "assistant",
                "content": "I've reviewed the changes. They look good, but I need approval before proceeding with the merge. This is a safety measure to prevent unintended modifications."
            },
            {
                "role": "system",
                "content": "⚠️ Automation paused: Waiting for human approval. This ensures no automated actions are taken without proper oversight."
            }
        ],
        "approval_required": True,
        "frozen": False
    },
    "frozen": {
        "title": "Frozen Thread - Automation Temporarily Disabled",
        "description": "This thread has been frozen, disabling all automation. This is a safe state where no automated actions can occur until the thread is unfrozen.",
        "state": "frozen",
        "messages": [
            {
                "role": "user",
                "content": "We need to pause automation on this thread due to ongoing investigation."
            },
            {
                "role": "assistant",
                "content": "Understood. I've frozen the thread. All automation is now disabled. This is a safe state - no automated actions will be taken until the thread is unfrozen."
            },
            {
                "role": "system",
                "content": "❄️ Thread frozen. All automation disabled. This is a safe, controlled pause. No automated actions will occur."
            }
        ],
        "approval_required": False,
        "frozen": True
    }
}


def create_html_page(state_data: Dict[str, Any], state_name: str) -> str:
    """
    Create an HTML page simulating the thread state view.
    
    Args:
        state_data: Dictionary containing thread state information
        state_name: Name of the state (e.g., 'needs_approval', 'frozen')
    
    Returns:
        HTML string for the simulated page
    """
    state_color = "#e74c3c" if state_name == "needs_approval" else "#3498db"
    state_icon = "⚠️" if state_name == "needs_approval" else "❄️"
    state_label = "Needs Approval" if state_name == "needs_approval" else "Frozen"
    
    messages_html = ""
    for msg in state_data["messages"]:
        role_class = msg["role"]
        messages_html += f"""
        <div class="message {role_class}">
            <div class="message-header">
                <span class="role-badge {role_class}">{msg['role'].title()}</span>
            </div>
            <div class="message-content">{msg['content']}</div>
        </div>
        """
    
    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{state_data['title']}</title>
        <style>
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                background: #f5f5f5;
                padding: 20px;
                color: #333;
            }}
            
            .container {{
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
            }}
            
            .header {{
                padding: 20px;
                border-bottom: 1px solid #e0e0e0;
                background: #fafafa;
            }}
            
            .state-indicator {{
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 600;
                color: white;
                background: {state_color};
                margin-bottom: 10px;
            }}
            
            .state-indicator .icon {{
                font-size: 16px;
            }}
            
            .thread-title {{
                font-size: 18px;
                font-weight: 600;
                color: #1a1a1a;
                margin-bottom: 8px;
            }}
            
            .thread-description {{
                font-size: 14px;
                color: #666;
                line-height: 1.5;
            }}
            
            .safety-notice {{
                margin: 15px 20px;
                padding: 12px 16px;
                background: #fff3cd;
                border: 1px solid #ffc107;
                border-radius: 6px;
                font-size: 14px;
                color: #856404;
            }}
            
            .safety-notice strong {{
                display: block;
                margin-bottom: 4px;
            }}
            
            .messages {{
                padding: 20px;
            }}
            
            .message {{
                margin-bottom: 16px;
                padding: 12px 16px;
                border-radius: 8px;
                background: #f8f9fa;
                border: 1px solid #e9ecef;
            }}
            
            .message.user {{
                background: #e3f2fd;
                border-color: #bbdefb;
            }}
            
            .message.assistant {{
                background: #f3e5f5;
                border-color: #e1bee7;
            }}
            
            .message.system {{
                background: #fff3e0;
                border-color: #ffe0b2;
                border-left: 4px solid #ff9800;
            }}
            
            .message-header {{
                margin-bottom: 8px;
            }}
            
            .role-badge {{
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
            }}
            
            .role-badge.user {{
                background: #1976d2;
                color: white;
            }}
            
            .role-badge.assistant {{
                background: #9c27b0;
                color: white;
            }}
            
            .role-badge.system {{
                background: #ff9800;
                color: white;
            }}
            
            .message-content {{
                font-size: 14px;
                line-height: 1.6;
                color: #333;
            }}
            
            .footer {{
                padding: 15px 20px;
                border-top: 1px solid #e0e0e0;
                background: #fafafa;
                font-size: 12px;
                color: #999;
                text-align: center;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="state-indicator">
                    <span class="icon">{state_icon}</span>
                    <span>{state_label}</span>
                </div>
                <h1 class="thread-title">{state_data['title']}</h1>
                <p class="thread-description">{state_data['description']}</p>
            </div>
            
            <div class="safety-notice">
                <strong>🔒 Safety Notice</strong>
                Automation is intentionally paused in this state. No automated actions will be taken without explicit human intervention. This is a safe, controlled state designed to prevent unintended modifications.
            </div>
            
            <div class="messages">
                {messages_html}
            </div>
            
            <div class="footer">
                AegisLoop - Thread State Visualization | Generated for documentation purposes
            </div>
        </div>
    </body>
    </html>
    """
    return html


def take_screenshot(page: Page, html_content: str, output_path: str) -> None:
    """
    Take a screenshot of the rendered HTML content.
    
    Args:
        page: Playwright page object
        html_content: HTML string to render
        output_path: Path to save the screenshot
    """
    page.set_content(html_content)
    page.wait_for_load_state("networkidle")
    
    # Set viewport to capture the full content
    page.set_viewport_size({"width": 1024, "height": 800})
    
    # Take screenshot of the full page
    page.screenshot(path=output_path, full_page=True)
    print(f"  ✓ Screenshot saved: {output_path}")


def generate_screenshots(output_dir: str) -> None:
    """
    Generate all screenshots for thread states.
    
    Args:
        output_dir: Directory to save screenshots
    """
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating screenshots in: {output_dir}")
    print("-" * 50)
    
    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1024, "height": 800},
            device_scale_factor=2  # Retina quality
        )
        page = context.new_page()
        
        for state_name, state_data in THREAD_STATES.items():
            print(f"\nProcessing state: {state_name}")
            
            # Generate HTML
            html_content = create_html_page(state_data, state_name)
            
            # Save HTML for reference (optional)
            html_path = output_path / f"{state_name}.html"
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"  ✓ HTML saved: {html_path}")
            
            # Take screenshot
            screenshot_path = output_path / f"{state_name}.png"
            take_screenshot(page, html_content, str(screenshot_path))
        
        context.close()
        browser.close()
    
    print("\n" + "=" * 50)
    print("All screenshots generated successfully!")
    print(f"Screenshots saved to: {output_dir}")


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Generate sanitized screenshots for AegisLoop thread states"
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for screenshots (default: {DEFAULT_OUTPUT_DIR})"
    )
    
    args = parser.parse_args()
    
    try:
        generate_screenshots(args.output_dir)
    except Exception as e:
        print(f"Error generating screenshots: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
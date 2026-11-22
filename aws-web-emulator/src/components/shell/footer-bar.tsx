"use client"

import Icon from "@cloudscape-design/components/icon"
import { catalogCommit } from "@/lib/service-catalog"

export function FooterBar() {
  return (
    <footer id="myaws-footer" className="myaws-footer awsui-dark-mode">
      <div className="myaws-footer-left">
        <span className="myaws-footer-item is-disabled" title="CloudShell is not available in the local emulator">
          <Icon name="command-prompt" size="small" /> CloudShell
        </span>
        <a
          className="myaws-footer-item"
          href="https://github.com/aws/aws-emulator/issues"
          target="_blank"
          rel="noreferrer"
        >
          Feedback
        </a>
      </div>
      <div className="myaws-footer-right">
        <span>MyAWS · local AWS Emulator console</span>
        <span className="myaws-mono">catalog {catalogCommit.slice(0, 7)}</span>
      </div>
    </footer>
  )
}

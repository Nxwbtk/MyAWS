"use client"

import Icon from "@cloudscape-design/components/icon"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Fragment } from "react"
import { ServiceIcon } from "@/components/service-icon"
import { AwsLogo } from "@/components/shell/aws-logo"
import { GlobalSearch } from "@/components/shell/global-search"
import { NavMenu } from "@/components/shell/nav-menu"
import { ServicesMenu } from "@/components/shell/services-menu"
import { useAws } from "@/lib/aws"
import { healthQuery } from "@/lib/console-client"
import { useFavorites } from "@/lib/favorites"
import { regionName, regions, serviceShortName } from "@/lib/service-meta"
import { useVisualMode, type VisualMode } from "@/lib/visual-mode"

const emulatorDocs = "https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html"
export const accountName = "local-emulator"

export function useCallerIdentity() {
  const health = useQuery(healthQuery)
  const identity = useAws<{ Account?: string; Arn?: string; UserId?: string }>(
    "sts",
    "GetCallerIdentity",
    {},
    { enabled: health.data?.connected === true, staleTime: Infinity },
  )
  const arn = identity.data?.Arn ?? ""
  const user = arn.includes(":root") ? "root" : arn.split("/").pop() || undefined
  return { account: identity.data?.Account, user, arn }
}

function formatAccount(account: string) {
  return account.replace(/^(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3")
}

export function TopNav() {
  const health = useQuery(healthQuery)
  const region = health.data?.region ?? "ap-southeast-7"
  const connected = health.data?.connected
  const status = connected ? "online" : health.isPending ? "checking" : "offline"
  const { account, user } = useCallerIdentity()

  return (
    <div id="myaws-top-nav" className="myaws-header awsui-dark-mode">
      <header className="myaws-top-nav">
        <a href="#main-content" className="myaws-skip-link">
          Skip to main content
        </a>
        <div className="myaws-top-nav-left">
          <Link href="/" className="myaws-home-link" aria-label="Console Home">
            <AwsLogo />
          </Link>
          <span
            className="myaws-nav-trigger is-static"
            title="Amazon Q is not available in the local emulator"
            aria-hidden
          >
            <Icon name="gen-ai" />
          </span>
          <span className="myaws-nav-divider" aria-hidden />
          <ServicesMenu />
        </div>

        <GlobalSearch />

        <div className="myaws-top-nav-right">
          <span
            className="myaws-nav-trigger is-static"
            title="CloudShell is not available in the local emulator"
            aria-hidden
          >
            <Icon name="command-prompt" />
          </span>

          <NavMenu
            label="Notifications"
            width={340}
            trigger={
              <>
                <Icon name="notification" />
                {status === "offline" && <span className="myaws-badge">1</span>}
              </>
            }
          >
            {() => (
              <div className="myaws-menu-body">
                <h2>Notifications</h2>
                {status === "offline" ? (
                  <div className="myaws-menu-alert">
                    <strong>Emulator API is offline</strong>
                    <p>
                      {health.error?.message ??
                        health.data?.detail ??
                        "The emulator did not respond."}
                    </p>
                    <Link href="/#local-setup">View startup commands</Link>
                  </div>
                ) : (
                  <p className="myaws-menu-muted">No new notifications.</p>
                )}
              </div>
            )}
          </NavMenu>

          <NavMenu label="Help" width={260} trigger={<Icon name="support" />}>
            {(close) => (
              <ul className="myaws-menu-list">
                <li>
                  <a href={emulatorDocs} target="_blank" rel="noreferrer" onClick={close}>
                    AWS Emulator documentation <Icon name="external" size="small" />
                  </a>
                </li>
                <li>
                  <a href="https://docs.aws.amazon.com/" target="_blank" rel="noreferrer" onClick={close}>
                    Documentation <Icon name="external" size="small" />
                  </a>
                </li>
                <li>
                  <Link href="/#local-setup" onClick={close}>
                    Local setup
                  </Link>
                </li>
              </ul>
            )}
          </NavMenu>

          <NavMenu label="Settings" width={280} trigger={<Icon name="settings" />}>
            {() => <SettingsMenu />}
          </NavMenu>

          <NavMenu
            label={`Region ${region}`}
            width={270}
            trigger={
              <span className="myaws-nav-text">
                {regionName(region)} <Icon name="caret-down-filled" size="small" />
              </span>
            }
          >
            {() => <RegionMenu current={region} />}
          </NavMenu>

          <NavMenu
            label="Account"
            width={244}
            trigger={
              <span className="myaws-account">
                <span className="myaws-account-name">
                  {accountName}
                  {account ? ` (${account})` : ""}{" "}
                  <Icon name="caret-down-filled" size="small" />
                </span>
                <span className="myaws-account-user">{user ?? "—"}</span>
              </span>
            }
          >
            {() => (
              <AccountMenu
                account={account}
                user={user}
                status={status}
                endpoint={health.data?.endpoint}
              />
            )}
          </NavMenu>
        </div>
      </header>
      <FavoritesBar />
    </div>
  )
}

function RegionMenu({ current }: { current: string }) {
  const groups = [...new Set(regions.map((region) => region.group))]
  return (
    <div className="myaws-region-menu">
      <div className="myaws-segmented" role="tablist">
        <span role="tab" aria-selected="true" className="is-active">
          Regions
        </span>
        <span role="tab" aria-selected="false" aria-disabled="true">
          Local Zones
        </span>
      </div>
      {groups.map((group) => (
        <Fragment key={group}>
          <h3>{group}</h3>
          <ul>
            {regions
              .filter((region) => region.group === group)
              .map((region) => (
                <li
                  key={region.code}
                  aria-current={region.code === current ? "true" : undefined}
                  data-disabled={region.code === current ? undefined : "true"}
                  className={region.code === current ? "is-selected" : ""}
                  title={
                    region.code === current
                      ? undefined
                      : "The local emulator serves one Region."
                  }
                >
                  <span>{region.name}</span>
                  <span>{region.code}</span>
                </li>
              ))}
          </ul>
        </Fragment>
      ))}
      <p className="myaws-menu-footnote">
        The local emulator serves one Region. Set EMULATOR_REGION to change it.
      </p>
    </div>
  )
}

function AccountMenu({
  account,
  user,
  status,
  endpoint,
}: {
  account?: string
  user?: string
  status: string
  endpoint?: string
}) {
  return (
    <div className="myaws-account-menu">
      <dl>
        <dt>Account ID</dt>
        <dd>
          <CopyValue value={account ? formatAccount(account) : "—"} raw={account} />
        </dd>
        <dt>Account name</dt>
        <dd>
          <CopyValue value={accountName} raw={accountName} />
        </dd>
        <dt>IAM user</dt>
        <dd>
          <CopyValue value={user ?? "—"} raw={user} />
        </dd>
        <dt>Emulator</dt>
        <dd className="myaws-account-endpoint">
          <span className={`myaws-status-dot is-${status}`} aria-hidden /> API {status}
          {endpoint && <span className="myaws-mono">{endpoint}</span>}
        </dd>
      </dl>
      <ul className="myaws-account-links">
        <li data-disabled="true">Account</li>
        <li data-disabled="true">Organization</li>
        <li data-disabled="true">Service Quotas</li>
        <li data-disabled="true">Billing and Cost Management</li>
        <li>
          <Link href="/iam?view=security-credentials">Security credentials</Link>
        </li>
      </ul>
      <div className="myaws-account-actions">
        <button type="button" disabled>
          Switch role
        </button>
        <button type="button" disabled className="is-primary">
          Sign out
        </button>
      </div>
    </div>
  )
}

function CopyValue({ value, raw }: { value: string; raw?: string }) {
  return (
    <span className="myaws-copy-value">
      <button
        type="button"
        aria-label={`Copy ${value}`}
        disabled={!raw}
        onClick={() => raw && void navigator.clipboard?.writeText(raw).catch(() => {})}
      >
        <Icon name="copy" size="small" />
      </button>
      {value}
    </span>
  )
}

function FavoritesBar() {
  const ids = useFavorites((state) => state.ids)
  if (ids.length === 0) return null
  return (
    <nav className="myaws-favorites-bar" aria-label="Favorites">
      {ids.map((id) => (
        <Link key={id} href={`/${id}`}>
          <ServiceIcon id={id} className="myaws-favorites-icon" />
          {serviceShortName(id)}
        </Link>
      ))}
    </nav>
  )
}

const modes: { id: VisualMode; label: string }[] = [
  { id: "browser", label: "Browser default" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
]

function SettingsMenu() {
  const mode = useVisualMode((state) => state.mode)
  const setMode = useVisualMode((state) => state.setMode)
  return (
    <div className="myaws-settings-menu">
      <h2>Current user settings</h2>
      <div className="myaws-settings-body">
        <label className="myaws-settings-label" htmlFor="myaws-language">
          Language
        </label>
        <select id="myaws-language" disabled defaultValue="default">
          <option value="default">Browser default</option>
        </select>
        <fieldset>
          <legend className="myaws-settings-label">
            Visual mode - <em>beta</em>
          </legend>
          {modes.map((item) => (
            <label key={item.id} className="myaws-settings-radio">
              <input
                type="radio"
                name="myaws-visual-mode"
                checked={mode === item.id}
                onChange={() => setMode(item.id)}
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      </div>
      <p className="myaws-settings-footer" aria-disabled="true">
        See all user settings
      </p>
    </div>
  )
}

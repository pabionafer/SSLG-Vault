"use client";

import { useState } from "react";
import { useSession, type Profile } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";
import {
  Badge,
  ErrorNote,
  Field,
  Spinner,
  btnPrimary,
  inputCls,
} from "@/components/ui";

function ProfileForm({ profile, refresh }: { profile: Profile; refresh: () => void }) {
  const { push } = useToast();
  const [form, setForm] = useState(() => ({
    full_name: profile.full_name ?? "",
    username: profile.username,
    bio: profile.bio ?? "",
    image: profile.profile_image_url ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await api("/api/users/me", {
      method: "PATCH",
      json: {
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        bio: form.bio.trim() || null,
        profile_image_url: form.image.trim() || null,
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setError(data.error ?? "Could not save profile");
      return;
    }
    const updated = (res.data as { user: { pending_username: string | null } }).user;
    if (updated.pending_username) {
      push("info", "Username change submitted for admin approval");
    } else {
      push("success", "Profile updated");
    }
    refresh();
  }

  const usernameChanged =
    form.username.trim() !== "" && form.username.trim() !== profile.username;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted">Your account details and preferences</p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tint text-2xl font-bold text-primary">
          {(profile.full_name ?? profile.username).charAt(0).toUpperCase()}
        </span>
        <div>
          <div className="text-lg font-bold">{profile.full_name ?? profile.username}</div>
          <div className="font-mono text-sm text-muted">@{profile.username}</div>
          <div className="mt-1 flex gap-2">
            <Badge tone="ok">{profile.role}</Badge>
            <Badge tone={profile.is_active ? "ok" : "danger"}>
              {profile.is_active ? "active" : "inactive"}
            </Badge>
          </div>
        </div>
      </div>

      {profile.pending_username && (
        <div className="rounded-lg border border-warn bg-warn-tint px-4 py-3 text-sm">
          You requested the username <strong>{profile.pending_username}</strong>. An admin must
          approve it before it takes effect.
        </div>
      )}

      <div className="max-w-xl space-y-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">Edit profile</h2>
        {error && <ErrorNote message={error} />}
        <Field label="Full name" htmlFor="p_full">
          <input
            id="p_full"
            className={inputCls}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Field>
        <Field label="Username" htmlFor="p_username">
          <input
            id="p_username"
            className={inputCls}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted">
            {usernameChanged
              ? "Saving sends this username to an admin for approval."
              : "3–30 chars: letters, numbers, _ . -"}
          </p>
        </Field>
        <Field label="Bio" htmlFor="p_bio">
          <textarea
            id="p_bio"
            rows={3}
            className={inputCls}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="A short line about you (shown to your team)"
          />
        </Field>
        <Field label="Profile image URL" htmlFor="p_img">
          <input
            id="p_img"
            type="url"
            className={inputCls}
            value={form.image}
            onChange={(e) => setForm({ ...form, image: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        <div className="flex justify-end">
          <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { profile, loading, refresh } = useSession();

  if (loading || !profile) return <Spinner />;
  return <ProfileForm profile={profile} refresh={refresh} />;
}

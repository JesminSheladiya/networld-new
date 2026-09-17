import { useState, useEffect, useRef } from "react";
import { Form, Input, Card, message, Typography } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-regular-svg-icons";
import { LockOutlined } from "@ant-design/icons";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { login } from "../Services/authService";
import { useAuth } from "../context/AuthContext";
import NetworkBackground from "./NetworkBackground";
import "./css/Auth.css";
import "./css/profile-page.css";

const { Title } = Typography;

function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();
  const firstInputRef = useRef(null);
  const [form] = Form.useForm();

  // Same as profile update — stays disabled until every field is filled.
  const values = Form.useWatch([], form);
  const loginReady = Boolean(values?.identifier?.trim() && values?.password);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const data = await login(values.identifier, values.password);
      const firstName = (data.fullName || "").trim().split(/\s+/)[0] || data.username;
      message.success(`Welcome, ${firstName}!`);
      authLogin();
      navigate("/contacts", { replace: true });
    } catch (error) {
      message.error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Login failed!"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <NetworkBackground />
      <div className="auth-vignette" />
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />

      <Card className="auth-card auth-card-login">
        <div className="auth-header">
          <div className="auth-logo">N</div>
          <Title className="auth-title" level={2}>
            NetWorld Login
          </Title>
        </div>

        <Form form={form} className="auth-form" name="login" onFinish={onFinish} autoComplete="off" layout="vertical">
          <Form.Item
            className="auth-field"
            name="identifier"
            rules={[{ required: true, message: "Please enter email, phone or username!" }]}
          >
            <Input
              className="auth-input"
              prefix={<FontAwesomeIcon icon={faUser} className="auth-input-icon" />}
              placeholder="Email / Phone / Username"
              size="large"
              ref={firstInputRef}
              autoComplete="username"
              inputMode="text"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="password"
            rules={[{ required: true, message: "Please enter password!" }]}
          >
            <Input.Password
              className="auth-input"
              prefix={<LockOutlined className="auth-input-icon" />}
              placeholder="Password"
              size="large"
              iconRender={(visible) => (
                <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} className="auth-input-icon" style={{ color: '#3b82f6', cursor: 'pointer' }} />
              )}
            />
          </Form.Item>

          <Form.Item className="auth-field auth-submit">
            <button
              type="submit"
              className="pf-primary-btn"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={!loginReady || loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </Form.Item>
        </Form>

        <div className="auth-footer">
          <Typography.Text className="auth-footer-text">
            Don't have an account?{" "}
            <button type="button" className="auth-switch-link" onClick={() => navigate("/register", { replace: true })}>
              Register here
            </button>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;

import { useState } from "react";
import { Form, Input, Button, Card, message, Typography, Select } from "antd";
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { register } from "../Services/authService";
import { useAuth } from "../context/AuthContext";
import NetworkBackground from "./NetworkBackground";
import "./css/Auth.css";

const { Title } = Typography;

function Register() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const firstName = values.name.trim().split(" ")[0];

      const data = await register(
        firstName,
        values.email,
        values.phone,
        values.password,
        values.name.trim(),
        values.gender
      );
      message.success(`Welcome, ${data.username}! Registration successful.`);
      authLogin();
      navigate("/contacts", { replace: true });
    } catch (error) {
      message.error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Registration failed!"
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

      <Card className="auth-card auth-card-register">
        <div className="auth-header">
          <div className="auth-logo">N</div>
          <Title className="auth-title" level={2}>
            Net World Register
          </Title>
        </div>

        <Form className="auth-form" name="register" onFinish={onFinish} autoComplete="off" layout="vertical">
          <Form.Item
            className="auth-field"
            name="name"
            rules={[
              { required: true, message: "Please enter your full name!" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const words = value.trim().split(/\s+/);
                  if (words.length < 2)
                    return Promise.reject("Please enter at least 2 words (First Last)!");
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<UserOutlined className="auth-input-icon" />}
              placeholder="Enter Name"
              size="large"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="email"
            rules={[
              { required: true, message: "Please enter email!" },
              { type: "email", message: "Please enter a valid email!" },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<MailOutlined className="auth-input-icon" />}
              placeholder="Email"
              size="large"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="phone"
            rules={[
              { required: true, message: "Please enter phone!" },
              { pattern: /^[0-9]{10}$/, message: "Phone must be 10 digits!" },
            ]}
          >
            <Input
              className="auth-input"
              prefix={<PhoneOutlined className="auth-input-icon" />}
              placeholder="Phone (10 digits)"
              size="large"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="password"
            rules={[
              { required: true, message: "Please enter password!" },
              { min: 8, message: "Password must be at least 8 characters!" },
            ]}
          >
            <Input.Password
              className="auth-input"
              prefix={<LockOutlined className="auth-input-icon" />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="gender"
            rules={[{ required: true, message: "Please select gender!" }]}
          >
            <Select
              className="auth-input"
              placeholder="Gender"
              size="large"
              options={[
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
              ]}
            />
          </Form.Item>

          <Form.Item className="auth-field auth-submit">
            <Button className="auth-btn" type="primary" htmlType="submit" loading={loading} block size="large">
              Register
            </Button>
          </Form.Item>
        </Form>

        <div className="auth-footer">
          <Typography.Text className="auth-footer-text">
            Already have an account?{" "}
            <a className="auth-switch-link" onClick={() => navigate("/login")}>
              Login here
            </a>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default Register;